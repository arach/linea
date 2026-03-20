import {
  createVoxdClient,
  type AlignmentResult,
  type JobMetadata,
  type VoxCapabilities,
} from "@voxd/client";

export type VoxCompanionCapabilities = VoxCapabilities;

export type VoxCompanionRuntime = {
  baseUrl: string;
  capabilities: VoxCompanionCapabilities;
};

export type VoxCompanionAlignment = AlignmentResult;

const LOCAL_PORT_CANDIDATES = [43115, 43116, 43117, 43118, 43119, 43120];
const CACHE_KEY = "linea:vox-companion-base-url";

async function probeBaseUrl(baseUrl: string): Promise<VoxCompanionRuntime | null> {
  try {
    const client = createVoxdClient({ baseUrl, probeTimeout: 1500, pollInterval: 1000 });
    const isAvailable = await client.probe();

    if (!isAvailable) {
      return null;
    }

    const health = await client.health();
    if (!health.ok || health.service !== "vox-companion") {
      return null;
    }

    const capabilities = await client.capabilities();
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
  const client = createVoxdClient({
    baseUrl: runtime.baseUrl,
    pollInterval: options?.pollIntervalMs ?? 1000,
  });

  const metadata: JobMetadata = {
    cacheKey: input.cacheKey ?? undefined,
    pageNumber: input.pageNumber ?? undefined,
    paragraphId: input.paragraphId ?? undefined,
  };

  const timeoutMs = options?.timeoutMs ?? 20000;

  const alignmentPromise = client.align({
    source: {
      audioUrl: input.audioUrl,
    },
    metadata,
  });

  return await Promise.race([
    alignmentPromise,
    new Promise<null>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => resolve(null), timeoutMs);

      if (options?.signal) {
        options.signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timeoutId);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    }),
  ]);
}
