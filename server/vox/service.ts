import fs from "node:fs/promises";

import type {
  VoxVoice,
  VoxCredentialStatus,
  VoxProviderId,
  VoxProviderStatus,
  VoxSynthesisRequest,
  VoxSynthesisResponse,
} from "../../src/lib/vox";
import { VoxCache } from "./cache";
import {
  getProviderApiKey,
  deleteProviderApiKey,
  getProviderCredentialStatus,
  setProviderApiKey,
} from "./config";
import { createVoxOraRuntime } from "./ora";
import type { VoxAlignment, VoxAlignedWord } from "./types";

type VoxOraRuntime = {
  listProviders(): VoxProviderId[];
  getProvider(provider: VoxProviderId): unknown;
  setCredentials(provider: VoxProviderId, credentials: { apiKey: string }): void;
  deleteCredentials(provider: VoxProviderId): boolean;
  listVoices(provider: VoxProviderId): Promise<VoxVoice[]>;
  listProviderSummaries(): Promise<
    Array<{
      id: VoxProviderId;
      label: string;
      hasCredentials: boolean;
      capabilities: {
        voiceDiscovery: boolean;
      };
    }>
  >;
  synthesize(request: {
    provider: VoxProviderId;
    text: string;
    voice: string;
    rate?: number;
    instructions?: string;
    format?: "mp3" | "wav" | "aac" | "opus";
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<{
    audioData?: Uint8Array;
    format: "mp3" | "wav" | "aac" | "opus";
  }>;
};

type VoxProviderAdapter = {
  label?: string;
  listVoices?: () => Promise<VoxVoice[]> | VoxVoice[];
};

export class VoxService {
  private cache = new VoxCache();
  private ora = createVoxOraRuntime();
  private runtime = this.ora.runtime as unknown as VoxOraRuntime;
  private providers = this.ora.providers as Record<VoxProviderId, VoxProviderAdapter>;
  private inflight = new Map<string, Promise<VoxSynthesisResponse>>();

  private async syncCredentials() {
    for (const providerId of this.runtime.listProviders() as VoxProviderId[]) {
      const apiKey = await getProviderApiKey(providerId);

      if (apiKey) {
        this.runtime.setCredentials(providerId, { apiKey });
        continue;
      }

      this.runtime.deleteCredentials(providerId);
    }
  }

  async listProviders(): Promise<VoxProviderStatus[]> {
    await this.syncCredentials();
    return Promise.all(
      (Object.keys(this.providers) as VoxProviderId[]).map(async (providerId) => {
        const provider = this.providers[providerId];
        const hasCredentials = Boolean(await getProviderApiKey(providerId));
        const voices = provider.listVoices ? await provider.listVoices() : [];
        return {
          id: providerId,
          label: provider.label ?? providerId,
          available: hasCredentials,
          defaultVoice: voices[0]?.id ?? "",
          voiceDiscovery: Boolean(provider.listVoices),
        };
      }),
    );
  }

  async getCapabilities() {
    return {
      alignment: await this.canAlign(),
    };
  }

  async listVoices(provider: VoxProviderId): Promise<VoxVoice[]> {
    await this.syncCredentials();
    return (await this.providers[provider]?.listVoices?.()) ?? [];
  }

  async listCredentialStatuses(): Promise<VoxCredentialStatus[]> {
    return Promise.all(
      (this.runtime.listProviders() as VoxProviderId[]).map((providerId) =>
        getProviderCredentialStatus(providerId as VoxProviderId),
      ),
    );
  }

  async getCredentialStatus(provider: VoxProviderId) {
    return getProviderCredentialStatus(provider);
  }

  async setCredential(provider: VoxProviderId, apiKey: string) {
    await setProviderApiKey(provider, apiKey);
    return getProviderCredentialStatus(provider);
  }

  async deleteCredential(provider: VoxProviderId) {
    await deleteProviderApiKey(provider);
    return getProviderCredentialStatus(provider);
  }

  async synthesize(request: VoxSynthesisRequest): Promise<VoxSynthesisResponse> {
    await this.syncCredentials();

    const provider = this.runtime.getProvider(request.provider);
    if (!provider) {
      throw new Error(`Unsupported provider: ${request.provider}`);
    }

    const rate = request.rate ?? 1;
    const availableVoices = (await this.providers[request.provider]?.listVoices?.()) ?? [];
    const defaultVoice = availableVoices[0]?.id ?? request.voice;
    const voice = request.voice || defaultVoice;

    if (!voice) {
      throw new Error(`No voice is configured for provider: ${request.provider}`);
    }

    const cacheKey = this.cache.generateKey({
      provider: request.provider,
      voice,
      rate,
      text: request.text,
      instructions: request.instructions,
    });

    const cachedEntry = await this.cache.get(cacheKey);
    if (cachedEntry) {
      console.info("[linea:vox] synth-cache-hit", {
        provider: request.provider,
        voice,
        cacheKey,
        pageNumber: request.source?.pageNumber ?? null,
        paragraphId: request.source?.paragraphId ?? null,
      });
      return {
        cacheKey,
        provider: request.provider,
        voice,
        rate,
        format: "mp3",
        cached: true,
        audioUrl: `/api/vox/audio/${cacheKey}`,
        source: cachedEntry.source,
      };
    }

    const existingRequest = this.inflight.get(cacheKey);
    if (existingRequest) {
      console.info("[linea:vox] synth-join-inflight", {
        provider: request.provider,
        voice,
        cacheKey,
        pageNumber: request.source?.pageNumber ?? null,
        paragraphId: request.source?.paragraphId ?? null,
      });
      return existingRequest;
    }

    console.info("[linea:vox] synth-cache-miss", {
      provider: request.provider,
      voice,
      cacheKey,
      textLength: request.text.length,
      pageNumber: request.source?.pageNumber ?? null,
      paragraphId: request.source?.paragraphId ?? null,
    });

    const pending = (async () => {
      const response = await this.runtime.synthesize({
        provider: request.provider,
        text: request.text,
        voice,
        rate,
        instructions: request.instructions,
        format: request.format ?? "mp3",
        metadata: request.source
          ? {
              pageNumber: request.source.pageNumber ?? null,
              paragraphId: request.source.paragraphId ?? null,
            }
          : undefined,
      });

      if (!response.audioData) {
        throw new Error(`Provider "${request.provider}" did not return buffered audio.`);
      }

      await this.cache.set({
        cacheKey,
        provider: request.provider,
        voice,
        rate,
        text: request.text,
        audio: Buffer.from(response.audioData),
        source: request.source,
      });

      console.info("[linea:vox] synth-generated", {
        provider: request.provider,
        voice,
        cacheKey,
        format: response.format,
      });

      return {
        cacheKey,
        provider: request.provider,
        voice,
        rate,
        format: response.format,
        cached: false,
        audioUrl: `/api/vox/audio/${cacheKey}`,
        source: request.source,
      } satisfies VoxSynthesisResponse;
    })();

    this.inflight.set(cacheKey, pending);

    try {
      return await pending;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  async resolveAudioPath(cacheKey: string) {
    const cachedEntry = await this.cache.get(cacheKey);
    if (cachedEntry) {
      console.info("[linea:vox] audio-served", {
        cacheKey,
        provider: cachedEntry.provider,
        voice: cachedEntry.voice,
      });
    }
    return cachedEntry?.filePath ?? null;
  }

  async getAlignment(cacheKey: string): Promise<VoxAlignment | null> {
    const entry = await this.cache.get(cacheKey);
    return entry?.alignment ?? null;
  }

  async align(cacheKey: string): Promise<VoxAlignment | null> {
    const entry = await this.cache.get(cacheKey);
    if (!entry) {
      throw new Error("Audio not found in cache");
    }

    // Return cached alignment if it exists
    if (entry.alignment) {
      console.info("[linea:vox] alignment-cache-hit", { cacheKey });
      return entry.alignment;
    }

    console.info("[linea:vox] alignment-start", {
      cacheKey,
      textLength: entry.text.length,
    });

    if (!(await this.canAlign())) {
      console.info("[linea:vox] alignment-skipped", {
        cacheKey,
        reason: "no-backend",
      });
      return null;
    }

    const whisperResult = await this.alignWithWhisper(entry.filePath);
    const words = whisperResult.words;
    const durationMs = whisperResult.durationMs;
    console.info("[linea:vox] alignment-source", { source: "whisper-api" });

    const alignment: VoxAlignment = {
      words,
      durationMs,
      createdAt: new Date().toISOString(),
    };

    await this.cache.updateAlignment(cacheKey, alignment);

    console.info("[linea:vox] alignment-done", {
      cacheKey,
      wordCount: words.length,
      durationMs,
    });

    return alignment;
  }

  private async canAlign() {
    return Boolean(await getProviderApiKey("openai"));
  }

  private async alignWithWhisper(filePath: string): Promise<{ words: VoxAlignedWord[]; durationMs: number }> {
    const apiKey = await getProviderApiKey("openai");
    if (!apiKey) {
      throw new Error("No alignment backend available (Vox offline, no OpenAI key)");
    }

    const audioBuffer = await fs.readFile(filePath);
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });

    const formData = new FormData();
    formData.append("file", blob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Whisper transcription failed (${response.status}): ${errorText}`);
    }

    const result = await response.json() as {
      duration?: number;
      words?: Array<{ word: string; start: number; end: number }>;
    };

    return {
      words: (result.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
      durationMs: (result.duration ?? 0) * 1000,
    };
  }
}
