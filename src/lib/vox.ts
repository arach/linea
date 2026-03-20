import type { OraAudioFormat, OraProviderId } from "@arach/ora";

export type VoxProviderId = Extract<OraProviderId, "openai" | "elevenlabs">;
export type VoxCredentialSource = "environment" | "keychain" | "settings-file" | null;
export type VoxVoice = {
  id: string;
  label: string;
  provider: VoxProviderId;
  locale?: string;
  styles?: string[];
  tags?: string[];
  previewText?: string;
  previewUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type VoxSynthesisRequest = {
  provider: VoxProviderId;
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

export type VoxSynthesisResponse = {
  cacheKey: string;
  provider: VoxProviderId;
  voice: string;
  rate: number;
  format: OraAudioFormat;
  cached: boolean;
  audioUrl: string;
  source?: VoxSynthesisRequest["source"];
};

export type VoxProviderStatus = {
  id: VoxProviderId;
  label: string;
  available: boolean;
  defaultVoice: string;
  voiceDiscovery: boolean;
};

export type VoxCapabilities = {
  alignment: boolean;
};

export type VoxCredentialStatus = {
  provider: VoxProviderId;
  configured: boolean;
  source: VoxCredentialSource;
  lastFour: string | null;
};

async function parseResponse<T>(response: Response) {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "The request failed");
  }

  return (await response.json()) as T;
}

export async function fetchVoxCredentials() {
  const payload = await parseResponse<{ credentials: VoxCredentialStatus[] }>(
    await fetch("/api/vox/credentials"),
  );

  return payload.credentials;
}

export async function fetchVoxProviders() {
  const payload = await parseResponse<{ providers: VoxProviderStatus[] }>(
    await fetch("/api/vox/providers"),
  );

  return payload.providers;
}

export async function fetchVoxCapabilities() {
  const payload = await parseResponse<{ capabilities: VoxCapabilities }>(
    await fetch("/api/vox/capabilities"),
  );

  return payload.capabilities;
}

export async function fetchVoxVoices(provider: VoxProviderId) {
  const payload = await parseResponse<{ voices: VoxVoice[] }>(
    await fetch(`/api/vox/providers/${provider}/voices`),
  );

  return payload.voices;
}

export async function saveVoxCredential(provider: VoxProviderId, apiKey: string) {
  const payload = await parseResponse<{ credential: VoxCredentialStatus }>(
    await fetch(`/api/vox/credentials/${provider}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    }),
  );

  return payload.credential;
}

export async function deleteVoxCredential(provider: VoxProviderId) {
  const payload = await parseResponse<{ credential: VoxCredentialStatus }>(
    await fetch(`/api/vox/credentials/${provider}`, {
      method: "DELETE",
    }),
  );

  return payload.credential;
}

export async function synthesizeVox(request: VoxSynthesisRequest, options?: { signal?: AbortSignal }) {
  return parseResponse<VoxSynthesisResponse>(
    await fetch("/api/vox/synthesize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: options?.signal,
      body: JSON.stringify(request),
    }),
  );
}

export type VoxAlignedWord = {
  word: string;
  start: number;   // seconds
  end: number;      // seconds
};

export type VoxAlignment = {
  words: VoxAlignedWord[];
  durationMs: number;
};

export async function alignVox(cacheKey: string, options?: { signal?: AbortSignal }): Promise<VoxAlignment | null> {
  const result = await parseResponse<{ alignment: VoxAlignment | null }>(
    await fetch(`/api/vox/align/${cacheKey}`, {
      method: "POST",
      signal: options?.signal,
    }),
  );
  return result.alignment;
}
