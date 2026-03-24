import {
  createVoxdClient,
  type AlignmentResult,
  type JobMetadata,
  type VoxCapabilities,
} from "@voxd/client";
import { recordDevInspectorEntry } from "@/lib/dev-inspector";

export type VoxCompanionCapabilities = VoxCapabilities;

export type VoxCompanionRuntime = {
  baseUrl: string;
  capabilities: VoxCompanionCapabilities;
};

export type VoxCompanionAlignment = AlignmentResult;

const LOCAL_PORT_CANDIDATES = [52137, 52138, 52139, 52140, 52141, 52142, 52143, 52144, 52145, 52146, 52147];
const CACHE_KEY = "linea:vox-companion-base-url";

async function probeBaseUrl(baseUrl: string): Promise<VoxCompanionRuntime | null> {
  const startedAt = performance.now();
  recordDevInspectorEntry({
    source: "voxd",
    action: "probe",
    status: "started",
    method: "GET",
    url: `${baseUrl}/health`,
  });
  try {
    const client = createVoxdClient({ baseUrl, probeTimeout: 1500, pollInterval: 1000 });
    const isAvailable = await client.probe();

    if (!isAvailable) {
      recordDevInspectorEntry({
        source: "voxd",
        action: "probe",
        status: "failed",
        method: "GET",
        url: `${baseUrl}/health`,
        durationMs: Math.round(performance.now() - startedAt),
        detail: { reason: "probe-failed" },
      });
      return null;
    }

    const health = await client.health();
    if (!health.ok || health.service !== "vox-companion") {
      recordDevInspectorEntry({
        source: "voxd",
        action: "probe",
        status: "failed",
        method: "GET",
        url: `${baseUrl}/health`,
        durationMs: Math.round(performance.now() - startedAt),
        detail: { reason: "invalid-health", service: health.service, ok: health.ok },
      });
      return null;
    }

    const capabilities = await client.capabilities();
    if (!capabilities.running) {
      recordDevInspectorEntry({
        source: "voxd",
        action: "capabilities",
        status: "failed",
        method: "GET",
        url: `${baseUrl}/capabilities`,
        durationMs: Math.round(performance.now() - startedAt),
        detail: { reason: "not-running" },
      });
      return null;
    }

    recordDevInspectorEntry({
      source: "voxd",
      action: "capabilities",
      status: "succeeded",
      method: "GET",
      url: `${baseUrl}/capabilities`,
      durationMs: Math.round(performance.now() - startedAt),
      detail: {
        alignment: capabilities.features?.alignment ?? false,
        local_asr: capabilities.features?.local_asr ?? false,
        streaming_progress: capabilities.features?.streaming_progress ?? false,
      },
    });

    return {
      baseUrl,
      capabilities,
    };
  } catch {
    recordDevInspectorEntry({
      source: "voxd",
      action: "probe",
      status: "failed",
      method: "GET",
      url: `${baseUrl}/health`,
      durationMs: Math.round(performance.now() - startedAt),
      detail: { reason: "exception" },
    });
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
  const startedAt = performance.now();
  recordDevInspectorEntry({
    source: "voxd",
    action: "align",
    status: "started",
    method: "POST",
    url: `${runtime.baseUrl}/jobs`,
    detail: {
      cacheKey: input.cacheKey ?? null,
      pageNumber: input.pageNumber ?? null,
      paragraphId: input.paragraphId ?? null,
    },
  });
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
    alignmentPromise.then((result) => {
      recordDevInspectorEntry({
        source: "voxd",
        action: "align",
        status: result ? "succeeded" : "failed",
        method: "POST",
        url: `${runtime.baseUrl}/jobs`,
        durationMs: Math.round(performance.now() - startedAt),
        detail: result
          ? { wordCount: result.words.length, durationMs: result.durationMs }
          : { reason: "no-result" },
      });
      return result;
    }),
    new Promise<null>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => resolve(null), timeoutMs);

      if (options?.signal) {
        options.signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timeoutId);
            recordDevInspectorEntry({
              source: "voxd",
              action: "align",
              status: "failed",
              method: "POST",
              url: `${runtime.baseUrl}/jobs`,
              durationMs: Math.round(performance.now() - startedAt),
              detail: { reason: "aborted" },
            });
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }
    }),
  ]);
}
