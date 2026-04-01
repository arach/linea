export type ReaderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReaderParagraph = {
  id: string;
  text: string;
  start: number;
  end: number;
  boxes?: ReaderRect[];
  skip?: { reason: string; confidence: number } | null;
  dimSpans?: { start: number; end: number; reason: string }[];
};

export type ReaderPage = {
  pageNumber: number;
  title: string;
  preview: string;
  text: string;
  lines: string[];
  paragraphs: ReaderParagraph[];
  wordCount: number;
  charCount: number;
  width: number;
  height: number;
  density: number;
  hasText: boolean;
};

export type ReaderDocument = {
  fileName: string;
  pageCount: number;
  totalWords: number;
  estimatedMinutes: number;
  loadedAt: string;
  source?: {
    url?: string;
    localPath?: string;
  };
  pages: ReaderPage[];
};

export type ExtractionProgress = {
  loadedPages: number;
  totalPages: number;
  phase: "loading" | "extracting" | "done";
};

import { classifyPage } from "./paragraph-classify";

const LISTENING_WPM = 155;

let pdfModulePromise: Promise<typeof import("pdfjs-dist")> | null = null;

export async function getPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = (async () => {
      const [{ GlobalWorkerOptions }, workerModule, pdfModule] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        import("pdfjs-dist"),
      ]);

      GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfModule;
    })();
  }

  return pdfModulePromise;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type ExtractedLine = {
  text: string;
  box: ReaderRect | null;
};

type ParagraphSeed = {
  text: string;
  lineIndexes: number[];
};

const SECTION_HEADING_RE =
  /^(?:abstract|introduction|background|related work|methods?|results?|discussion|conclusion|conclusions?|references|bibliography|acknowledg(?:e)?ments?)$/i;
const ALL_CAPS_HEADING_RE = /^[A-Z][A-Z\s\d:.-]{4,}$/;
const TITLE_CASE_HEADING_RE = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5}$/;
const EMAIL_LINE_RE = /[\w.-]+@[\w.-]+\.\w{2,}/;
const AFFILIATION_LINE_RE =
  /\b(?:google brain|google research|university|institute|department|faculty|school of|college of|laboratory|lab)\b/i;
const AUTHOR_MARKER_RE = /[∗*†‡]/;
const FRONT_MATTER_FOOTNOTE_RE =
  /^(?:[∗*†‡]\s+|31st Conference on Neural Information Processing Systems|arXiv:)/i;
const PERMISSION_NOTICE_RE =
  /\bpermission to reproduce\b|\bjournalistic or scholarly works\b/i;
const CONTRIBUTION_NOTE_RE = /^(?:[∗*†‡]\s*)?(?:Equal contribution\.|Listing order is random\.)/i;

function isSectionHeading(line: string) {
  return SECTION_HEADING_RE.test(line);
}

function looksLikeFrontMatterLine(line: string, pageNumber: number) {
  if (pageNumber !== 1) {
    return false;
  }

  const wordCount = line.split(/\s+/).filter(Boolean).length;

  if (PERMISSION_NOTICE_RE.test(line)) {
    return true;
  }

  if (/^[∗*†‡]$/.test(line)) {
    return true;
  }

  if (CONTRIBUTION_NOTE_RE.test(line)) {
    return true;
  }

  if (FRONT_MATTER_FOOTNOTE_RE.test(line)) {
    return true;
  }

  if (EMAIL_LINE_RE.test(line)) {
    return true;
  }

  if (AFFILIATION_LINE_RE.test(line) && wordCount <= 12) {
    return true;
  }

  if (AUTHOR_MARKER_RE.test(line) && wordCount <= 14) {
    return true;
  }

  return false;
}

function unionRects(rects: ReaderRect[]) {
  if (rects.length === 0) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  } satisfies ReaderRect;
}

function extractItemRect(item: Record<string, unknown>, pageHeight: number) {
  const transform = Array.isArray(item.transform) ? item.transform : [];
  const x = typeof transform[4] === "number" ? transform[4] : null;
  const y = typeof transform[5] === "number" ? transform[5] : null;
  const width =
    typeof item.width === "number"
      ? item.width
      : typeof transform[0] === "number"
        ? Math.abs(transform[0])
        : 0;
  const height =
    typeof item.height === "number"
      ? item.height
      : typeof transform[3] === "number"
        ? Math.abs(transform[3])
        : 0;

  if (x == null || y == null || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x,
    y: Math.max(0, pageHeight - y - height),
    width,
    height,
  } satisfies ReaderRect;
}

function extractLines(items: Array<Record<string, unknown>>, pageHeight: number) {
  const lines: ExtractedLine[] = [];
  let currentLine = "";
  let currentRects: ReaderRect[] = [];
  let previousY: number | null = null;

  const flush = () => {
    const normalized = normalizeText(currentLine);
    if (!normalized) {
      currentLine = "";
      currentRects = [];
      return;
    }

    lines.push({
      text: normalized,
      box: unionRects(currentRects),
    });
    currentLine = "";
    currentRects = [];
  };

  for (const item of items) {
    const rawText = typeof item.str === "string" ? item.str : "";
    const text = rawText.trim();

    if (!text) {
      continue;
    }

    const transform = Array.isArray(item.transform) ? item.transform : [];
    const rawY = transform[5];
    const y: number = typeof rawY === "number" ? rawY : (previousY ?? 0);
    const hasEOL = Boolean(item.hasEOL);
    const shouldBreak = previousY !== null && Math.abs(y - previousY) > 4;

    if ((shouldBreak || hasEOL) && currentLine.trim()) {
      flush();
    }

    const needsSpace =
      currentLine.length > 0 &&
      !/[(-/]$/.test(currentLine) &&
      !/^[,.;:!?)}\]]/.test(text);

    currentLine += `${needsSpace ? " " : ""}${text}`;
    const rect = extractItemRect(item, pageHeight);
    if (rect) {
      currentRects.push(rect);
    }
    previousY = y;
  }

  if (currentLine.trim()) {
    flush();
  }

  return lines;
}

function splitIntoParagraphs(lines: ExtractedLine[], pageNumber: number) {
  const paragraphs: ParagraphSeed[] = [];
  let current = "";
  let currentLineIndexes: number[] = [];
  let currentMode: "body" | "front-matter" | null = null;
  let trailingFrontMatter = false;

  const flush = () => {
    if (!current.trim()) {
      return;
    }

    paragraphs.push({
      text: current.trim(),
      lineIndexes: [...currentLineIndexes],
    });
    current = "";
    currentLineIndexes = [];
    currentMode = null;
  };

  for (const [lineIndex, line] of lines.entries()) {
    const normalizedLine = normalizeText(line.text);

    if (!normalizedLine) {
      continue;
    }

    const sectionHeading = isSectionHeading(normalizedLine);
    if (pageNumber === 1 && CONTRIBUTION_NOTE_RE.test(normalizedLine)) {
      trailingFrontMatter = true;
    }

    const frontMatterLine =
      trailingFrontMatter || looksLikeFrontMatterLine(normalizedLine, pageNumber);
    const headingLike =
      ALL_CAPS_HEADING_RE.test(normalizedLine) ||
      TITLE_CASE_HEADING_RE.test(normalizedLine);

    if (sectionHeading) {
      trailingFrontMatter = false;
      flush();
      current = normalizedLine;
      currentLineIndexes = [lineIndex];
      currentMode = "body";
      continue;
    }

    if (frontMatterLine) {
      if (currentMode === "body") {
        flush();
      }

      current += `${current ? " " : ""}${normalizedLine}`;
      currentLineIndexes.push(lineIndex);
      currentMode = "front-matter";

      if (/[.!?]"?$/.test(normalizedLine) || current.length > 180) {
        flush();
      }

      continue;
    }

    if (currentMode === "front-matter") {
      flush();
    }

    if (headingLike && current) {
      flush();
    }

    current += `${current ? " " : ""}${normalizedLine}`;
    currentLineIndexes.push(lineIndex);
    currentMode = "body";

    if (/[.!?]"?$/.test(normalizedLine) && current.length > 340) {
      flush();
      continue;
    }

    if (current.length > 760) {
      flush();
    }
  }

  flush();

  if (paragraphs.length === 0 && lines.length > 0) {
    paragraphs.push({
      text: lines.map((line) => normalizeText(line.text)).join(" "),
      lineIndexes: lines.map((_, index) => index),
    });
  }

  return paragraphs;
}

function createParagraphOffsets(pageNumber: number, paragraphs: ParagraphSeed[], lines: ExtractedLine[]): ReaderParagraph[] {
  let cursor = 0;

  return paragraphs.map((paragraph, index) => {
    const start = cursor;
    const end = start + paragraph.text.length;
    cursor = end + 2;

    const boxes = paragraph.lineIndexes
      .map((lineIndex) => lines[lineIndex]?.box ?? null)
      .filter((box): box is ReaderRect => Boolean(box));

    return {
      id: `page-${pageNumber}-paragraph-${index + 1}`,
      text: paragraph.text,
      start,
      end,
      boxes,
    };
  });
}

function countWords(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function pickTitle(lines: string[], pageNumber: number) {
  const candidate = lines.find((line) => line.length > 4 && line.length < 96);
  return candidate ?? `Page ${pageNumber}`;
}

export function buildReaderPageFromText(
  pageNumber: number,
  width: number,
  height: number,
  rawText: string,
  fallbackTitle?: string,
) {
  const rawLines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  const extractedLines = rawLines.map((line) => ({ text: line, box: null }));
  const paragraphText = splitIntoParagraphs(extractedLines, pageNumber);
  const paragraphs = createParagraphOffsets(pageNumber, paragraphText, extractedLines);

  const classifications = classifyPage(paragraphs, pageNumber);
  for (let i = 0; i < paragraphs.length; i += 1) {
    const c = classifications[i];
    if (c.skip) {
      paragraphs[i].skip = { reason: c.reason!, confidence: c.confidence };
    } else if (c.spans.length > 0) {
      paragraphs[i].dimSpans = c.spans.map((s) => ({
        start: s.start,
        end: s.end,
        reason: s.reason,
      }));
    }
  }

  const text = paragraphs.map((paragraph) => paragraph.text).join("\n\n");
  const wordCount = countWords(text);
  const charCount = text.length;

  return {
    pageNumber,
    title: fallbackTitle ?? pickTitle(rawLines, pageNumber),
    preview:
      paragraphs[0]?.text.slice(0, 180) ?? "No extractable text detected on this page yet.",
    text,
    lines: rawLines,
    paragraphs,
    wordCount,
    charCount,
    width,
    height,
    density: charCount / Math.max(width * height, 1),
    hasText: wordCount > 0,
  } satisfies ReaderPage;
}

export async function loadReaderDocument(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void,
  source?: ReaderDocument["source"],
) {
  onProgress?.({
    loadedPages: 0,
    totalPages: 0,
    phase: "loading",
  });

  const pdfjs = await getPdfModule();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  onProgress?.({
    loadedPages: 0,
    totalPages: pdf.numPages,
    phase: "extracting",
  });

  const pages: ReaderPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const extractedLines = extractLines(textContent.items as Array<Record<string, unknown>>, viewport.height);
    const lines = extractedLines.map((line) => line.text);
    const paragraphText = splitIntoParagraphs(extractedLines, pageNumber);
    const paragraphs = createParagraphOffsets(pageNumber, paragraphText, extractedLines);

    // Classify paragraphs for skip/dim detection
    const classifications = classifyPage(paragraphs, pageNumber);
    for (let i = 0; i < paragraphs.length; i++) {
      const c = classifications[i];
      if (c.skip) {
        paragraphs[i].skip = { reason: c.reason!, confidence: c.confidence };
      } else if (c.spans.length > 0) {
        paragraphs[i].dimSpans = c.spans.map((s) => ({
          start: s.start,
          end: s.end,
          reason: s.reason,
        }));
      }
    }

    const text = paragraphs.map((paragraph) => paragraph.text).join("\n\n");
    const wordCount = countWords(text);
    const charCount = text.length;

    pages.push({
      pageNumber,
      title: pickTitle(lines, pageNumber),
      preview:
        paragraphs[0]?.text.slice(0, 180) ?? "No extractable text detected on this page yet.",
      text,
      lines,
      paragraphs,
      wordCount,
      charCount,
      width: viewport.width,
      height: viewport.height,
      density: charCount / Math.max(viewport.width * viewport.height, 1),
      hasText: wordCount > 0,
    });

    page.cleanup();
    onProgress?.({
      loadedPages: pageNumber,
      totalPages: pdf.numPages,
      phase: pageNumber === pdf.numPages ? "done" : "extracting",
    });
  }

  pdf.cleanup();

  const totalWords = pages.reduce((sum, page) => sum + page.wordCount, 0);

  return {
    fileName: file.name,
    pageCount: pdf.numPages,
    totalWords,
    estimatedMinutes: Math.max(1, Math.round(totalWords / LISTENING_WPM)),
    loadedAt: new Date().toISOString(),
    source,
    pages,
  } satisfies ReaderDocument;
}
