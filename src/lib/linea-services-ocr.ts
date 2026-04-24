import { recordDevInspectorEntry } from "@/lib/dev-inspector";

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

const OCR_PAGE_URL = "/api/linea/services/ocr/page";

async function parseResponse(
  response: Response,
  startedAt: number,
  request: LineaOcrPageRequest,
) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    recordDevInspectorEntry({
      source: "intake",
      action: "ocr-page",
      status: "failed",
      method: "POST",
      url: OCR_PAGE_URL,
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        sampleFile: request.sampleFile,
        page: request.page,
        error: payload?.error ?? "OCR failed",
        status: response.status,
      },
    });
    throw new Error(payload?.error ?? "OCR failed");
  }

  const payload = (await response.json()) as { result: LineaOcrPageResult };
  recordDevInspectorEntry({
    source: "intake",
    action: "ocr-page",
    status: "succeeded",
    method: "POST",
    url: OCR_PAGE_URL,
    durationMs: Math.round(performance.now() - startedAt),
    detail: {
      sampleFile: request.sampleFile,
      page: payload.result.pageNumber,
      textLength: payload.result.text.length,
      usedOcr: payload.result.usedOcr,
      averageConfidence: payload.result.averageConfidence,
      itemCount: payload.result.itemCount,
    },
  });

  return payload.result;
}

export async function fetchLineaOcrPage(request: LineaOcrPageRequest) {
  const startedAt = performance.now();
  recordDevInspectorEntry({
    source: "intake",
    action: "ocr-page",
    status: "started",
    method: "POST",
    url: OCR_PAGE_URL,
    detail: {
      sampleFile: request.sampleFile,
      page: request.page,
    },
  });

  const response = await fetch(OCR_PAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return parseResponse(response, startedAt, request);
}
