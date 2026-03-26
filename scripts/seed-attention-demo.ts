import fs from "node:fs/promises";
import path from "node:path";

import { buildReaderPageFromText } from "../src/lib/pdf";
import type { ReaderPage } from "../src/lib/pdf";
import { VoxCache } from "../server/vox/cache";
import { VoxService } from "../server/vox/service";
import type { VoxCacheEntry } from "../server/vox/types";

const SAMPLE_FILE = "attention-is-all-you-need.pdf";
const SAMPLE_DOCUMENT_ID = "attention-is-all-you-need";
const DEFAULT_PROVIDER = "openai" as const;
const DEFAULT_VOICE = "alloy";
const DEFAULT_RATE = 1;

const repoRoot = path.resolve(import.meta.dir, "..");
const samplePdfPath = path.join(repoRoot, "public", "samples", SAMPLE_FILE);
const seededAudioDir = path.join(repoRoot, "public", "vox-cache");
const seededManifestPath = path.join(repoRoot, "server", "vox", "seeded-cache.json");

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

function buildPlaybackText(page: ReaderPage) {
  const eligible = page.paragraphs.filter((paragraph) => !paragraph.skip);
  const text = eligible
    .map((paragraph) => page.text.slice(paragraph.start, paragraph.end))
    .join("\n\n")
    .trim();

  return {
    text,
    firstParagraphId: eligible[0]?.id ?? null,
  };
}

async function loadSamplePages() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(samplePdfPath));
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages: ReaderPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const lines = extractLines(textContent.items as Array<Record<string, unknown>>);
    pages.push(
      buildReaderPageFromText(
        pageNumber,
        viewport.width,
        viewport.height,
        lines.join("\n"),
      ),
    );
    page.cleanup();
  }

  pdf.cleanup();
  return pages;
}

async function readManifest() {
  try {
    const raw = await fs.readFile(seededManifestPath, "utf8");
    return JSON.parse(raw) as Record<string, VoxCacheEntry>;
  } catch {
    return {};
  }
}

async function writeManifest(manifest: Record<string, VoxCacheEntry>) {
  await fs.writeFile(seededManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const vox = new VoxService();
  const cache = new VoxCache();
  const pages = await loadSamplePages();
  const manifest = await readManifest();
  await fs.mkdir(seededAudioDir, { recursive: true });

  let seededCount = 0;
  let skippedCount = 0;

  for (const page of pages) {
    const playback = buildPlaybackText(page);
    if (!playback.text) {
      continue;
    }

    const cacheKey = cache.generateKey({
      provider: DEFAULT_PROVIDER,
      voice: DEFAULT_VOICE,
      rate: DEFAULT_RATE,
      text: playback.text,
    });
    const staticAudioPath = path.join(seededAudioDir, `${cacheKey}.mp3`);
    const existingEntry = manifest[cacheKey];

    if (existingEntry?.alignment && existingEntry.audioUrl) {
      try {
        await fs.access(staticAudioPath);
        console.log(`Skipping Attention demo page ${page.pageNumber}/${pages.length} (already seeded).`);
        skippedCount += 1;
        continue;
      } catch {
        // Re-seed if the manifest entry exists but the static audio asset is missing.
      }
    }

    console.log(`Seeding Attention demo page ${page.pageNumber}/${pages.length}...`);
    const synthesis = await vox.synthesize(
      {
        provider: DEFAULT_PROVIDER,
        voice: DEFAULT_VOICE,
        rate: DEFAULT_RATE,
        text: playback.text,
        source: {
          documentId: SAMPLE_DOCUMENT_ID,
          pageNumber: page.pageNumber,
          paragraphId: playback.firstParagraphId,
        },
      },
      {
        allowManagedCredentials: true,
        allowLocalCredentials: true,
      },
    );

    const cacheEntry = await vox.getCacheEntry(synthesis.cacheKey);
    if (!cacheEntry?.filePath) {
      throw new Error(`Cache entry missing audio file for ${synthesis.cacheKey}`);
    }

    const alignment = await vox.align(
      synthesis.cacheKey,
      {
        allowManagedCredentials: true,
        allowLocalCredentials: true,
      },
    );

    await fs.copyFile(
      cacheEntry.filePath,
      staticAudioPath,
    );

    manifest[synthesis.cacheKey] = {
      ...cacheEntry,
      filePath: null,
      audioUrl: `/vox-cache/${synthesis.cacheKey}.mp3`,
      immutable: true,
      alignment: alignment ?? cacheEntry.alignment,
      source: {
        documentId: SAMPLE_DOCUMENT_ID,
        pageNumber: page.pageNumber,
        paragraphId: playback.firstParagraphId,
      },
    };
    await writeManifest(manifest);

    seededCount += 1;
  }

  await writeManifest(manifest);
  console.log(`Seeded ${seededCount} pages for ${SAMPLE_FILE}; skipped ${skippedCount} existing pages.`);
}

await main();
