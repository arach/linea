import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SAMPLE_ROOT = path.resolve(process.cwd(), "public", "samples");
const TESSDATA_CACHE_DIR = path.join(os.tmpdir(), "linea-liteparse-tessdata");
const LITEPARSE_BIN = path.resolve(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "lit.cmd" : "lit",
);

type LiteParseJsonTextItem = {
  fontName?: string;
  confidence?: number;
};

type LiteParseJsonPage = {
  page?: number;
  text?: string;
  textItems?: LiteParseJsonTextItem[];
};

type LiteParseJsonPayload = {
  pages?: LiteParseJsonPage[];
};

export type LineaOcrPageRequest = {
  sampleFile: string;
  page: number;
  language?: string;
};

export type LineaOcrPageResult = {
  pageNumber: number;
  text: string;
  usedOcr: boolean;
  averageConfidence: number | null;
  itemCount: number;
};

function roundConfidence(value: number) {
  return Math.round(value * 100) / 100;
}

async function resolveSamplePdfPath(sampleFile: string) {
  const normalized = path.basename(sampleFile.trim());
  if (!normalized || !normalized.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only bundled sample PDFs can be parsed with LiteParse.");
  }

  const [sampleRoot, candidate] = await Promise.all([
    fs.realpath(SAMPLE_ROOT),
    fs.realpath(path.resolve(SAMPLE_ROOT, normalized)),
  ]);

  if (candidate !== sampleRoot && !candidate.startsWith(`${sampleRoot}${path.sep}`)) {
    throw new Error("The requested sample PDF is outside the allowed directory.");
  }

  return candidate;
}

function summarizePage(page: LiteParseJsonPage, requestedPage: number): LineaOcrPageResult {
  const text = typeof page.text === "string" ? page.text.trim() : "";
  const textItems = Array.isArray(page.textItems) ? page.textItems : [];
  const ocrItems = textItems.filter((item) => item.fontName === "OCR");
  const confidenceValues = ocrItems
    .map((item) => item.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageConfidence = confidenceValues.length
    ? roundConfidence(
        confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length,
      )
    : null;

  return {
    pageNumber:
      typeof page.page === "number" && Number.isInteger(page.page) && page.page > 0
        ? page.page
        : requestedPage,
    text,
    usedOcr: ocrItems.length > 0,
    averageConfidence,
    itemCount: textItems.length,
  };
}

function buildLiteParseErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout =
      "stdout" in error && typeof error.stdout === "string" ? error.stdout.trim() : "";
    const fallback =
      error instanceof Error ? error.message : "LiteParse OCR failed.";
    return stderr || stdout || fallback;
  }

  return error instanceof Error ? error.message : "LiteParse OCR failed.";
}

export async function parseBundledSamplePageWithLiteParse(
  input: LineaOcrPageRequest,
): Promise<LineaOcrPageResult> {
  if (!Number.isInteger(input.page) || input.page < 1) {
    throw new Error("Page must be a positive integer.");
  }

  const samplePdfPath = await resolveSamplePdfPath(input.sampleFile);
  await fs.access(LITEPARSE_BIN);
  await fs.mkdir(TESSDATA_CACHE_DIR, { recursive: true });

  try {
    const { stdout } = await execFileAsync(
      LITEPARSE_BIN,
      [
        "parse",
        samplePdfPath,
        "--format",
        "json",
        "--target-pages",
        String(input.page),
        "--ocr-language",
        input.language?.trim() || "eng",
      ],
      {
        cwd: TESSDATA_CACHE_DIR,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
        },
        maxBuffer: 12 * 1024 * 1024,
        windowsHide: true,
      },
    );

    const payload = JSON.parse(stdout) as LiteParseJsonPayload;
    const page =
      payload.pages?.find((entry) => entry.page === input.page) ??
      payload.pages?.[0];

    if (!page) {
      throw new Error("LiteParse returned no page data.");
    }

    return summarizePage(page, input.page);
  } catch (error) {
    throw new Error(buildLiteParseErrorMessage(error));
  }
}
