export type VoxCompanionCapabilities = {
  running: boolean;
  version: string;
  features?: {
    alignment?: boolean;
    local_asr?: boolean;
    streaming_progress?: boolean;
  };
  backends?: Record<string, boolean>;
  models?: Array<{
    id: string;
    name: string;
    backend: string;
    available: boolean;
    installed?: boolean;
    preloaded?: boolean;
  }>;
};

export type VoxCompanionRuntime = {
  baseUrl: string;
  capabilities: VoxCompanionCapabilities;
};

export type VoxCompanionAlignment = {
  words: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  durationMs: number;
};

const LOCAL_PORT_CANDIDATES = [43115, 43116, 43117, 43118, 43119, 43120];
const CACHE_KEY = "linea:vox-companion-base-url";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

async function probeBaseUrl(baseUrl: string): Promise<VoxCompanionRuntime | null> {
  try {
    const health = await fetchJson<{ ok: boolean; service?: string; version?: string }>(
      `${baseUrl}/health`,
    );

    if (!health.ok || health.service !== "vox-companion") {
      return null;
    }

    const capabilities = await fetchJson<VoxCompanionCapabilities>(`${baseUrl}/capabilities`);
    if (!capabilities.running) {
      return null;
    }

    return {
      baseUrl,
      capabilities,
    };
  } catch {
    return null;
  }
}

function getCachedBaseUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(CACHE_KEY);
}

function setCachedBaseUrl(baseUrl: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!baseUrl) {
    window.localStorage.removeItem(CACHE_KEY);
    return;
  }

  window.localStorage.setItem(CACHE_KEY, baseUrl);
}

export async function discoverVoxCompanion() {
  const candidates: string[] = [];
  const cachedBaseUrl = getCachedBaseUrl();

  if (cachedBaseUrl) {
    candidates.push(cachedBaseUrl);
  }

  for (const port of LOCAL_PORT_CANDIDATES) {
    const baseUrl = `http://127.0.0.1:${port}`;
    if (!candidates.includes(baseUrl)) {
      candidates.push(baseUrl);
    }
  }

  for (const candidate of candidates) {
    const runtime = await probeBaseUrl(candidate);
    if (runtime) {
      setCachedBaseUrl(candidate);
      return runtime;
    }
  }

  setCachedBaseUrl(null);
  return null;
}

export async function alignWithVoxCompanion(
  runtime: VoxCompanionRuntime,
  input: {
    audioUrl: string;
    cacheKey?: string | null;
    pageNumber?: number | null;
    paragraphId?: string | null;
  },
  options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
) {
  const create = await fetchJson<{ accepted: boolean; jobId: string }>(`${runtime.baseUrl}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: options?.signal,
    body: JSON.stringify({
      type: "alignment",
      source: {
        audioUrl: input.audioUrl,
      },
      metadata: {
        cacheKey: input.cacheKey ?? null,
        pageNumber: input.pageNumber ?? null,
        paragraphId: input.paragraphId ?? null,
      },
    }),
  });

  const startedAt = Date.now();
  const timeoutMs = options?.timeoutMs ?? 20000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;

  while (Date.now() - startedAt < timeoutMs) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const status = await fetchJson<{
      status: string;
      error?: string;
      result?: {
        alignment?: VoxCompanionAlignment;
      };
      alignment?: VoxCompanionAlignment;
    }>(`${runtime.baseUrl}/jobs/${create.jobId}`, {
      signal: options?.signal,
    });

    if (status.status === "completed") {
      return status.result?.alignment ?? status.alignment ?? null;
    }

    if (status.status === "failed") {
      throw new Error(status.error ?? "Companion alignment failed");
    }

    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
  }

  return null;
}
