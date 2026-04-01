import { recordDevInspectorEntry } from "@/lib/dev-inspector";

export type LineaExplainRequest = {
  text: string;
  contextText?: string;
  documentTitle?: string;
  pageNumber?: number;
};

export type LineaExplainResponse = {
  explanation: string;
  provider: "groq" | "openai";
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

async function parseResponse<T>(
  response: Response,
  context?: {
    action: string;
    method?: string;
    url?: string;
    startedAt?: number;
    detail?: Record<string, unknown>;
  },
) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    recordDevInspectorEntry({
      source: "vox",
      action: context?.action ?? "explain",
      status: "failed",
      method: context?.method,
      url: context?.url ?? response.url,
      durationMs: context?.startedAt ? Math.round(performance.now() - context.startedAt) : undefined,
      detail: {
        status: response.status,
        error: payload?.error ?? "The request failed",
        ...(context?.detail ?? {}),
      },
    });
    throw new Error(payload?.error ?? "The request failed");
  }

  const data = (await response.json()) as T;

  if (context) {
    const payload = data as LineaExplainResponse;
    recordDevInspectorEntry({
      source: "vox",
      action: context.action,
      status: "succeeded",
      method: context.method,
      url: context.url ?? response.url,
      durationMs: context.startedAt ? Math.round(performance.now() - context.startedAt) : undefined,
      detail: {
        ...context.detail,
        provider: payload.provider,
        model: payload.model,
        length: payload.explanation.length,
        inputTokens: payload.usage.inputTokens,
        outputTokens: payload.usage.outputTokens,
      },
    });
  }

  return data;
}

export async function fetchLineaExplanation(payload: LineaExplainRequest) {
  const startedAt = performance.now();
  recordDevInspectorEntry({
    source: "vox",
    action: "explain",
    status: "started",
    method: "POST",
    url: "/api/vox/explain",
    detail: {
      textLength: payload.text.length,
      pageNumber: payload.pageNumber ?? null,
    },
  });

  return parseResponse<LineaExplainResponse>(
    await fetch("/api/vox/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
    {
      action: "explain",
      method: "POST",
      url: "/api/vox/explain",
      startedAt,
      detail: {
        textLength: payload.text.length,
        pageNumber: payload.pageNumber ?? null,
      },
    },
  );
}
