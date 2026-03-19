export type ReaderParagraph = {
  id: string;
  text: string;
  start: number;
  end: number;
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
  pages: ReaderPage[];
};

export type ExtractionProgress = {
  loadedPages: number;
  totalPages: number;
  phase: "loading" | "extracting" | "done";
};

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

function extractLines(items: Array<Record<string, unknown>>) {
  const lines: string[] = [];
  let currentLine = "";
  let previousY: number | null = null;

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
      lines.push(normalizeText(currentLine));
      currentLine = "";
    }

    const needsSpace =
      currentLine.length > 0 &&
      !/[(-/]$/.test(currentLine) &&
      !/^[,.;:!?)}\]]/.test(text);

    currentLine += `${needsSpace ? " " : ""}${text}`;
    previousY = y;
  }

  if (currentLine.trim()) {
    lines.push(normalizeText(currentLine));
  }

  return lines;
}

function splitIntoParagraphs(lines: string[]) {
  const paragraphs: string[] = [];
  let current = "";

  for (const line of lines) {
    const normalizedLine = normalizeText(line);

    if (!normalizedLine) {
      continue;
    }

    const shouldBreak =
      current.length > 380 ||
      /^[A-Z][A-Z\s\d:.-]{4,}$/.test(normalizedLine) ||
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5}$/.test(normalizedLine);

    if (shouldBreak && current) {
      paragraphs.push(current.trim());
      current = normalizedLine;
      continue;
    }

    current += `${current ? " " : ""}${normalizedLine}`;

    if (/[.!?]"?$/.test(normalizedLine) && current.length > 260) {
      paragraphs.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) {
    paragraphs.push(current.trim());
  }

  if (paragraphs.length === 0 && lines.length > 0) {
    paragraphs.push(lines.map(normalizeText).join(" "));
  }

  return paragraphs;
}

function createParagraphOffsets(pageNumber: number, paragraphs: string[]): ReaderParagraph[] {
  let cursor = 0;

  return paragraphs.map((paragraph, index) => {
    const start = cursor;
    const end = start + paragraph.length;
    cursor = end + 2;

    return {
      id: `page-${pageNumber}-paragraph-${index + 1}`,
      text: paragraph,
      start,
      end,
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

export async function loadReaderDocument(
  file: File,
  onProgress?: (progress: ExtractionProgress) => void,
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
    const lines = extractLines(textContent.items as Array<Record<string, unknown>>);
    const paragraphText = splitIntoParagraphs(lines);
    const paragraphs = createParagraphOffsets(pageNumber, paragraphText);
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
    pages,
  } satisfies ReaderDocument;
}
