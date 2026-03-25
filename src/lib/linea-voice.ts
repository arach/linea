import type { OraAudioFormat, OraProviderId } from "@arach/ora";
import { recordDevInspectorEntry } from "@/lib/dev-inspector";

export type LineaVoiceProviderId = Extract<OraProviderId, "openai" | "elevenlabs">;
export type LineaVoiceCredentialSource =
  | "environment"
  | "keychain"
  | "settings-file"
  | "managed"
  | null;
export type LineaVoice = {
  id: string;
  label: string;
  provider: LineaVoiceProviderId;
  locale?: string;
  styles?: string[];
  tags?: string[];
  previewText?: string;
  previewUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type LineaVoiceSynthesisRequest = {
  provider: LineaVoiceProviderId;
  text: string;
  voice: string;
  rate?: number;
  instructions?: string;
  format?: OraAudioFormat;
  source?: {
    documentId?: string;
    pageNumber?: number;
    paragraphId?: string | null;
  };
};

export type LineaVoiceSynthesisResponse = {
  cacheKey: string;
  provider: LineaVoiceProviderId;
  voice: string;
  rate: number;
  format: OraAudioFormat;
  cached: boolean;
  audioUrl: string;
  audioDataBase64?: string;
  audioMimeType?: string;
  source?: LineaVoiceSynthesisRequest["source"];
};

export type LineaVoiceProviderStatus = {
  id: LineaVoiceProviderId;
  label: string;
  available: boolean;
  defaultVoice: string;
  voiceDiscovery: boolean;
};

export type LineaVoiceCapabilities = {
  alignment: boolean;
};

export type LineaVoiceCredentialStatus = {
  provider: LineaVoiceProviderId;
  configured: boolean;
  source: LineaVoiceCredentialSource;
  lastFour: string | null;
};

export type LineaAlignedWord = {
  word: string;
  start: number;
  end: number;
};

export type LineaVoiceAlignment = {
  words: LineaAlignedWord[];
  durationMs: number;
};

async function parseResponse<T>(
  response: Response,
  context?: { action: string; method?: string; url?: string; startedAt?: number; detail?: Record<string, unknown> },
) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    recordDevInspectorEntry({
      source: "vox",
      action: context?.action ?? "request",
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
    let resultDetail: Record<string, unknown> | undefined;

    if (context.action === "providers") {
      const payload = data as { providers?: LineaVoiceProviderStatus[] };
      resultDetail = {
        ...context.detail,
        providerCount: payload.providers?.length ?? 0,
        availableProviders: payload.providers?.filter((provider) => provider.available).map((provider) => provider.id) ?? [],
      };
    } else if (context.action === "voices") {
      const payload = data as { voices?: LineaVoice[] };
      resultDetail = {
        ...context.detail,
        voiceCount: payload.voices?.length ?? 0,
        voices: payload.voices?.slice(0, 8).map((voice) => voice.id) ?? [],
      };
    } else if (context.action === "capabilities") {
      const payload = data as { capabilities?: LineaVoiceCapabilities };
      resultDetail = {
        ...context.detail,
        alignment: payload.capabilities?.alignment ?? false,
      };
    } else if (context.action === "credentials") {
      const payload = data as { credentials?: LineaVoiceCredentialStatus[] };
      resultDetail = {
        ...context.detail,
        credentials: payload.credentials?.map((credential) => ({
          provider: credential.provider,
          configured: credential.configured,
          source: credential.source,
        })) ?? [],
      };
    } else if (context.action === "save-credential" || context.action === "delete-credential") {
      const payload = data as { credential?: LineaVoiceCredentialStatus };
      resultDetail = {
        ...context.detail,
        credential: payload.credential
          ? {
              provider: payload.credential.provider,
              configured: payload.credential.configured,
              source: payload.credential.source,
            }
          : null,
      };
    } else if (context.action === "synthesize") {
      const payload = data as LineaVoiceSynthesisResponse;
      resultDetail = {
        ...context.detail,
        cacheKey: payload.cacheKey,
        cached: payload.cached,
        format: payload.format,
        audioUrl: payload.audioUrl,
        inlineAudio: Boolean(payload.audioDataBase64),
      };
    } else if (context.action === "align") {
      const payload = data as { alignment: LineaVoiceAlignment | null };
      resultDetail = {
        ...context.detail,
        wordCount: payload.alignment?.words.length ?? 0,
        durationMs: payload.alignment?.durationMs ?? null,
      };
    }

    recordDevInspectorEntry({
      source: "vox",
      action: context.action,
      status: "succeeded",
      method: context.method,
      url: context.url ?? response.url,
      durationMs: context.startedAt ? Math.round(performance.now() - context.startedAt) : undefined,
      detail: resultDetail ?? context.detail,
    });
  }

  return data;
}

function recordVoxRequestStart(context: {
  action: string;
  method: string;
  url: string;
  detail?: Record<string, unknown>;
}) {
  recordDevInspectorEntry({
    source: "vox",
    action: context.action,
    status: "started",
    method: context.method,
    url: context.url,
    detail: context.detail,
  });
}

export async function fetchLineaVoiceCredentials() {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "credentials",
    method: "GET",
    url: "/api/vox/credentials",
  });
  const payload = await parseResponse<{ credentials: LineaVoiceCredentialStatus[] }>(
    await fetch("/api/vox/credentials"),
    {
      action: "credentials",
      method: "GET",
      url: "/api/vox/credentials",
      startedAt,
    },
  );

  return payload.credentials;
}

export async function fetchLineaVoiceProviders() {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "providers",
    method: "GET",
    url: "/api/vox/providers",
  });
  const payload = await parseResponse<{ providers: LineaVoiceProviderStatus[] }>(
    await fetch("/api/vox/providers"),
    {
      action: "providers",
      method: "GET",
      url: "/api/vox/providers",
      startedAt,
    },
  );

  return payload.providers;
}

export async function fetchLineaVoiceCapabilities() {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "capabilities",
    method: "GET",
    url: "/api/vox/capabilities",
  });
  const payload = await parseResponse<{ capabilities: LineaVoiceCapabilities }>(
    await fetch("/api/vox/capabilities"),
    {
      action: "capabilities",
      method: "GET",
      url: "/api/vox/capabilities",
      startedAt,
    },
  );

  return payload.capabilities;
}

export async function fetchLineaVoiceVoices(provider: LineaVoiceProviderId) {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "voices",
    method: "GET",
    url: `/api/vox/providers/${provider}/voices`,
    detail: { provider },
  });
  const payload = await parseResponse<{ voices: LineaVoice[] }>(
    await fetch(`/api/vox/providers/${provider}/voices`),
    {
      action: "voices",
      method: "GET",
      url: `/api/vox/providers/${provider}/voices`,
      startedAt,
      detail: { provider },
    },
  );

  return payload.voices;
}

export async function saveLineaVoiceCredential(provider: LineaVoiceProviderId, apiKey: string) {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "save-credential",
    method: "PUT",
    url: `/api/vox/credentials/${provider}`,
    detail: { provider },
  });
  const payload = await parseResponse<{ credential: LineaVoiceCredentialStatus }>(
    await fetch(`/api/vox/credentials/${provider}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    }),
    {
      action: "save-credential",
      method: "PUT",
      url: `/api/vox/credentials/${provider}`,
      startedAt,
      detail: { provider },
    },
  );

  return payload.credential;
}

export async function deleteLineaVoiceCredential(provider: LineaVoiceProviderId) {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "delete-credential",
    method: "DELETE",
    url: `/api/vox/credentials/${provider}`,
    detail: { provider },
  });
  const payload = await parseResponse<{ credential: LineaVoiceCredentialStatus }>(
    await fetch(`/api/vox/credentials/${provider}`, {
      method: "DELETE",
    }),
    {
      action: "delete-credential",
      method: "DELETE",
      url: `/api/vox/credentials/${provider}`,
      startedAt,
      detail: { provider },
    },
  );

  return payload.credential;
}

export async function synthesizeLineaVoice(
  request: LineaVoiceSynthesisRequest,
  options?: { signal?: AbortSignal },
) {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "synthesize",
    method: "POST",
    url: "/api/vox/synthesize",
    detail: {
      provider: request.provider,
      voice: request.voice,
      pageNumber: request.source?.pageNumber ?? null,
      paragraphId: request.source?.paragraphId ?? null,
      textLength: request.text.length,
    },
  });
  return parseResponse<LineaVoiceSynthesisResponse>(
    await fetch("/api/vox/synthesize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: options?.signal,
      body: JSON.stringify(request),
    }),
    {
      action: "synthesize",
      method: "POST",
      url: "/api/vox/synthesize",
      startedAt,
      detail: {
        provider: request.provider,
        voice: request.voice,
        pageNumber: request.source?.pageNumber ?? null,
        paragraphId: request.source?.paragraphId ?? null,
        textLength: request.text.length,
      },
    },
  );
}

export async function alignLineaVoice(
  cacheKey: string,
  options?: { signal?: AbortSignal },
): Promise<LineaVoiceAlignment | null> {
  const startedAt = performance.now();
  recordVoxRequestStart({
    action: "align",
    method: "POST",
    url: `/api/vox/align/${cacheKey}`,
    detail: { cacheKey },
  });
  const result = await parseResponse<{ alignment: LineaVoiceAlignment | null }>(
    await fetch(`/api/vox/align/${cacheKey}`, {
      method: "POST",
      signal: options?.signal,
    }),
    {
      action: "align",
      method: "POST",
      url: `/api/vox/align/${cacheKey}`,
      startedAt,
      detail: { cacheKey },
    },
  );
  return result.alignment;
}
