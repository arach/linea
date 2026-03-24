import { recordDevInspectorEntry } from "@/lib/dev-inspector";

export type FabricRunnerRuntime = {
  baseUrl: string;
  version: string;
  tasks: string[];
};

type FabricRunnerJobResponse = {
  job: {
    id: string;
    status: "queued" | "running" | "completed" | "failed";
    result?: {
      text?: string;
      durationMs?: number;
      pageNumber?: number;
      engine?: string;
      language?: string;
      confidence?: number;
      score?: number;
      profile?: string;
      mimeType?: string;
      dpi?: number;
      dataUrl?: string;
    };
    error?: string;
  };
};

const FABRIC_RUNNER_BASE_URL = "http://127.0.0.1:52157";

function summarizeFabrunData(action: string, data: unknown) {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  if (action === "health") {
    const value = data as { service?: string; version?: string };
    return {
      service: value.service,
      version: value.version,
    };
  }

  if (action === "capabilities") {
    const value = data as { tasks?: string[] };
    return {
      tasks: Array.isArray(value.tasks) ? value.tasks : [],
    };
  }

  if (action === "jobs" || action === "job-status") {
    const value = data as FabricRunnerJobResponse;
    const job = value.job;
    if (!job) {
      return undefined;
    }

    const result = job.result;
    const textPreview =
      typeof result?.text === "string" && result.text.trim()
        ? result.text.trim().slice(0, 180)
        : undefined;

    return {
      jobId: job.id,
      status: job.status,
      error: job.error,
      result: result
        ? {
            pageNumber: result.pageNumber,
            engine: result.engine,
            language: result.language,
            durationMs: result.durationMs,
            confidence: result.confidence,
            score: result.score,
            profile: result.profile,
            mimeType: result.mimeType,
            dpi: result.dpi,
            hasImage: typeof result.dataUrl === "string",
            textPreview,
          }
        : null,
    };
  }

  return undefined;
}

async function fetchJson<T>(url: string, init?: RequestInit, options?: { requestDetail?: Record<string, unknown> }) {
  const startedAt = performance.now();
  const method = init?.method ?? "GET";
  const action = url.endsWith("/health")
    ? "health"
    : url.endsWith("/capabilities")
      ? "capabilities"
      : url.includes("/jobs/")
        ? "job-status"
        : url.endsWith("/jobs")
          ? "jobs"
          : "request";

  recordDevInspectorEntry({
    source: "fabrun",
    action,
    status: "started",
    method,
    url,
    detail: options?.requestDetail,
  });
  const response = await fetch(url, init);
  if (!response.ok) {
    recordDevInspectorEntry({
      source: "fabrun",
      action,
      status: "failed",
      method,
      url,
      durationMs: Math.round(performance.now() - startedAt),
      detail: { status: response.status },
    });
    throw new Error(`Request failed (${response.status})`);
  }
  const data = (await response.json()) as T;
  recordDevInspectorEntry({
    source: "fabrun",
    action,
    status: "succeeded",
    method,
    url,
    durationMs: Math.round(performance.now() - startedAt),
    detail: summarizeFabrunData(action, data),
  });
  return data;
}

export async function probeFabricRunner(): Promise<FabricRunnerRuntime | null> {
  try {
    const [health, capabilities] = await Promise.all([
      fetchJson<{ service: string; version: string }>(`${FABRIC_RUNNER_BASE_URL}/health`),
      fetchJson<{ tasks: string[] }>(`${FABRIC_RUNNER_BASE_URL}/capabilities`),
    ]);

    if (health.service !== "fabric-runner") {
      return null;
    }

    return {
      baseUrl: FABRIC_RUNNER_BASE_URL,
      version: health.version,
      tasks: Array.isArray(capabilities.tasks) ? capabilities.tasks : [],
    };
  } catch {
    return null;
  }
}

export async function submitFabricRunnerOcrPageJob(
  runtime: FabricRunnerRuntime,
  input: {
    pdfPath: string;
    page: number;
    language?: string;
  },
) {
  const response = await fetchJson<FabricRunnerJobResponse>(`${runtime.baseUrl}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "ocr.page",
      input,
    }),
  }, {
    requestDetail: {
      type: "ocr.page",
      page: input.page,
      language: input.language ?? "eng",
      pdfPath: input.pdfPath,
    },
  });

  return response.job;
}

export async function submitFabricRunnerPdfPageImageJob(
  runtime: FabricRunnerRuntime,
  input: {
    pdfPath: string;
    page: number;
    dpi?: number;
  },
) {
  const response = await fetchJson<FabricRunnerJobResponse>(`${runtime.baseUrl}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "pdf.page-image",
      input,
    }),
  }, {
    requestDetail: {
      type: "pdf.page-image",
      page: input.page,
      dpi: input.dpi ?? 300,
      pdfPath: input.pdfPath,
    },
  });

  return response.job;
}

export async function pollFabricRunnerJob(
  runtime: FabricRunnerRuntime,
  jobId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
) {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const intervalMs = options?.intervalMs ?? 750;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetchJson<FabricRunnerJobResponse>(`${runtime.baseUrl}/jobs/${jobId}`);

    if (response.job.status === "completed" || response.job.status === "failed") {
      return response.job;
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  throw new Error("OCR job timed out");
}
