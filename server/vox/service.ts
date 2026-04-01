import fs from "node:fs/promises";
import path from "node:path";

import type { OraAudioFormat } from "@arach/ora";

import type {
  LineaExplainRequest,
  LineaExplainResponse,
} from "../../src/lib/linea-explain";
import type {
  LineaVoice,
  LineaVoiceCredentialStatus,
  LineaVoiceProviderId,
  LineaVoiceProviderStatus,
  LineaVoiceSynthesisRequest,
  LineaVoiceSynthesisResponse,
} from "../../src/lib/linea-voice";
import { VoxCache } from "./cache";
import {
  getProviderApiKey,
  getProviderApiKeyWithScope,
  deleteProviderApiKey,
  getProviderCredentialStatus,
  setProviderApiKey,
} from "./config";
import { createVoxOraRuntime } from "./ora";
import type { VoxAlignment, VoxAlignedWord } from "./types";

type VoxOraRuntime = {
  listProviders(): LineaVoiceProviderId[];
  getProvider(provider: LineaVoiceProviderId): unknown;
  setCredentials(provider: LineaVoiceProviderId, credentials: { apiKey: string }): void;
  deleteCredentials(provider: LineaVoiceProviderId): boolean;
  listVoices(provider: LineaVoiceProviderId): Promise<LineaVoice[]>;
  listProviderSummaries(): Promise<
    Array<{
      id: LineaVoiceProviderId;
      label: string;
      hasCredentials: boolean;
      capabilities: {
        voiceDiscovery: boolean;
      };
    }>
  >;
  synthesize(request: {
    provider: LineaVoiceProviderId;
    text: string;
    voice: string;
    rate?: number;
    instructions?: string;
    format?: OraAudioFormat;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<{
    audioData?: Uint8Array;
    format: OraAudioFormat;
  }>;
};

type VoxProviderAdapter = {
  label?: string;
  listVoices?: () => Promise<LineaVoice[]> | LineaVoice[];
};

type VoxCredentialScope = {
  allowManagedCredentials?: boolean;
  allowLocalCredentials?: boolean;
};

type ExplainProviderRuntime = {
  provider: "groq" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
};

function resolveCredentialScope(scope?: VoxCredentialScope) {
  return {
    allowManagedCredentials: scope?.allowManagedCredentials ?? false,
    allowLocalCredentials: scope?.allowLocalCredentials ?? true,
  };
}

function parseNullableInteger(value: string | undefined, fallback: number) {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getExplainModel() {
  return (
    process.env.LINEA_EXPLAIN_MODEL?.trim() ||
    process.env.GROQ_EXPLAIN_MODEL?.trim() ||
    "llama-3.1-8b-instant"
  );
}

function getExplainInputTokenLimit() {
  return parseNullableInteger(process.env.LINEA_EXPLAIN_MAX_INPUT_TOKENS, 700);
}

function getExplainOutputTokenLimit() {
  return parseNullableInteger(process.env.LINEA_EXPLAIN_MAX_OUTPUT_TOKENS, 220);
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.trim().length / 4));
}

function getManagedGroqApiKey() {
  return process.env.LINEA_MANAGED_GROQ_API_KEY?.trim() ?? "";
}

function getLocalGroqApiKey() {
  return process.env.GROQ_API_KEY?.trim() ?? "";
}

async function resolveExplainRuntime(scope?: VoxCredentialScope): Promise<ExplainProviderRuntime | null> {
  const allowManaged = scope?.allowManagedCredentials ?? false;
  const allowLocal = scope?.allowLocalCredentials ?? true;

  if (allowManaged) {
    const managedGroq = getManagedGroqApiKey();
    if (managedGroq) {
      return {
        provider: "groq",
        apiKey: managedGroq,
        baseUrl: "https://api.groq.com/openai/v1",
        model: getExplainModel(),
      };
    }
  }

  if (allowLocal) {
    const localGroq = getLocalGroqApiKey();
    if (localGroq) {
      return {
        provider: "groq",
        apiKey: localGroq,
        baseUrl: "https://api.groq.com/openai/v1",
        model: getExplainModel(),
      };
    }
  }

  const openAiKey = await getProviderApiKeyWithScope("openai", {
    allowManaged,
    allowLocal,
  });

  if (openAiKey) {
    return {
      provider: "openai",
      apiKey: openAiKey,
      baseUrl: "https://api.openai.com/v1",
      model:
        process.env.OPENAI_EXPLAIN_MODEL?.trim() ||
        process.env.OPENAI_MODEL?.trim() ||
        "gpt-4.1-mini",
    };
  }

  return null;
}

function getMessageTextContent(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        if (
          entry &&
          typeof entry === "object" &&
          "type" in entry &&
          (entry as { type?: string }).type === "text" &&
          "text" in entry
        ) {
          return String((entry as { text?: unknown }).text ?? "");
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

export class VoxService {
  private cache = new VoxCache();
  private ora = createVoxOraRuntime();
  private runtime = this.ora.runtime as unknown as VoxOraRuntime;
  private providers = this.ora.providers as Record<LineaVoiceProviderId, VoxProviderAdapter>;
  private inflight = new Map<string, Promise<LineaVoiceSynthesisResponse>>();

  private async syncCredentials(scope?: VoxCredentialScope) {
    const credentialScope = resolveCredentialScope(scope);

    for (const providerId of this.runtime.listProviders() as LineaVoiceProviderId[]) {
      const apiKey = await getProviderApiKeyWithScope(providerId, {
        allowManaged: credentialScope.allowManagedCredentials,
        allowLocal: credentialScope.allowLocalCredentials,
      });

      if (apiKey) {
        this.runtime.setCredentials(providerId, { apiKey });
        continue;
      }

      this.runtime.deleteCredentials(providerId);
    }
  }

  async listProviders(scope?: VoxCredentialScope): Promise<LineaVoiceProviderStatus[]> {
    const credentialScope = resolveCredentialScope(scope);
    await this.syncCredentials(credentialScope);
    return Promise.all(
      (Object.keys(this.providers) as LineaVoiceProviderId[]).map(async (providerId) => {
        const provider = this.providers[providerId];
        const hasCredentials = Boolean(
          await getProviderApiKeyWithScope(providerId, {
            allowManaged: credentialScope.allowManagedCredentials,
            allowLocal: credentialScope.allowLocalCredentials,
          }),
        );
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

  async getCapabilities(scope?: VoxCredentialScope) {
    return {
      alignment: await this.canAlign(scope),
    };
  }

  async listVoices(provider: LineaVoiceProviderId, scope?: VoxCredentialScope): Promise<LineaVoice[]> {
    await this.syncCredentials(scope);
    return (await this.providers[provider]?.listVoices?.()) ?? [];
  }

  async listCredentialStatuses(scope?: VoxCredentialScope): Promise<LineaVoiceCredentialStatus[]> {
    const credentialScope = resolveCredentialScope(scope);
    return Promise.all(
      (this.runtime.listProviders() as LineaVoiceProviderId[]).map((providerId) =>
        getProviderCredentialStatus(providerId as LineaVoiceProviderId, {
          allowManaged: credentialScope.allowManagedCredentials,
          allowLocal: credentialScope.allowLocalCredentials,
        }),
      ),
    );
  }

  async getCredentialStatus(provider: LineaVoiceProviderId, scope?: VoxCredentialScope) {
    const credentialScope = resolveCredentialScope(scope);
    return getProviderCredentialStatus(provider, {
      allowManaged: credentialScope.allowManagedCredentials,
      allowLocal: credentialScope.allowLocalCredentials,
    });
  }

  async setCredential(provider: LineaVoiceProviderId, apiKey: string) {
    await setProviderApiKey(provider, apiKey);
    return getProviderCredentialStatus(provider);
  }

  async deleteCredential(provider: LineaVoiceProviderId) {
    await deleteProviderApiKey(provider);
    return getProviderCredentialStatus(provider);
  }

  async explain(
    input: LineaExplainRequest,
    scope?: VoxCredentialScope,
  ): Promise<LineaExplainResponse> {
    const runtime = await resolveExplainRuntime(scope);
    if (!runtime) {
      throw new Error("Add a Groq or OpenAI key, or sign in to use explanations.");
    }

    const text = input.text.trim();
    const contextText = input.contextText?.trim() ?? "";

    if (!text) {
      throw new Error("Text is required.");
    }

    if (text.length > 8_000) {
      throw new Error("Select a shorter passage to explain.");
    }

    const systemPrompt =
      "You are Linea, a thoughtful reading companion. Explain the selected passage clearly, concretely, and without hype. Keep the answer concise, usually 2 short paragraphs. Define jargon in plain language. If context is available, use it to say what role the passage plays in the document.";
    const userPrompt = [
      input.documentTitle ? `Document: ${input.documentTitle}` : "",
      input.pageNumber ? `Page: ${input.pageNumber}` : "",
      contextText ? `Context:\n${contextText}` : "",
      `Selected passage:\n${text}`,
      "Explain this selection in clear language for a reader who wants help understanding it.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const estimatedInputTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
    const maxInputTokens = getExplainInputTokenLimit();
    const maxOutputTokens = getExplainOutputTokenLimit();

    if (estimatedInputTokens > maxInputTokens) {
      throw new Error(
        `This selection is a little too large to explain in one shot. Try something under about ${maxInputTokens} prompt tokens.`,
      );
    }

    const response = await fetch(`${runtime.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.apiKey}`,
      },
      body: JSON.stringify({
        model: runtime.model,
        temperature: 0.4,
        max_tokens: maxOutputTokens,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      throw new Error(payload?.error?.message ?? `Explain request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: unknown;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const explanation = getMessageTextContent(payload.choices?.[0]?.message?.content);
    if (!explanation) {
      throw new Error("The model returned an empty explanation.");
    }

    const inputTokens = Math.max(0, Math.round(payload.usage?.prompt_tokens ?? estimatedInputTokens));
    const outputTokens = Math.max(0, Math.round(payload.usage?.completion_tokens ?? estimateTokens(explanation)));
    const totalTokens = Math.max(
      inputTokens + outputTokens,
      Math.round(payload.usage?.total_tokens ?? 0),
    );

    return {
      explanation,
      provider: runtime.provider,
      model: runtime.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
    };
  }

  async synthesize(
    request: LineaVoiceSynthesisRequest,
    scope?: VoxCredentialScope,
  ): Promise<LineaVoiceSynthesisResponse> {
    await this.syncCredentials(scope);

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
        audioUrl: cachedEntry.audioUrl ?? `/api/vox/audio/${cacheKey}`,
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
        audioDataBase64: Buffer.from(response.audioData).toString("base64"),
        audioMimeType: response.mimeType ?? "audio/mpeg",
        source: request.source,
      } satisfies LineaVoiceSynthesisResponse;
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
    return this.resolveEntryAudioPath(cachedEntry);
  }

  async getAlignment(cacheKey: string): Promise<VoxAlignment | null> {
    const entry = await this.cache.get(cacheKey);
    return entry?.alignment ?? null;
  }

  async getCacheEntry(cacheKey: string) {
    return this.cache.get(cacheKey);
  }

  async getCacheEntryForRequest(request: LineaVoiceSynthesisRequest) {
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

    return {
      cacheKey,
      voice,
      rate,
      entry: await this.cache.get(cacheKey),
    };
  }

  async align(cacheKey: string, scope?: VoxCredentialScope): Promise<VoxAlignment | null> {
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

    if (!(await this.canAlign(scope))) {
      console.info("[linea:vox] alignment-skipped", {
        cacheKey,
        reason: "no-backend",
      });
      return null;
    }

    const audioPath = await this.resolveEntryAudioPath(entry);
    if (!audioPath) {
      throw new Error("Audio file is not available for alignment");
    }

    const whisperResult = await this.alignWithWhisper(audioPath, scope);
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

  private async resolveEntryAudioPath(entry: { filePath?: string | null; audioUrl?: string | null } | null) {
    if (!entry) {
      return null;
    }

    if (entry.filePath) {
      return entry.filePath;
    }

    if (!entry.audioUrl?.startsWith("/vox-cache/")) {
      return null;
    }

    const staticAudioPath = path.join(process.cwd(), "public", entry.audioUrl.replace(/^\//, ""));

    try {
      await fs.access(staticAudioPath);
      return staticAudioPath;
    } catch {
      return null;
    }
  }

  private async canAlign(scope?: VoxCredentialScope) {
    const credentialScope = resolveCredentialScope(scope);
    return Boolean(
      await getProviderApiKeyWithScope("openai", {
        allowManaged: credentialScope.allowManagedCredentials,
        allowLocal: credentialScope.allowLocalCredentials,
      }),
    );
  }

  private async alignWithWhisper(
    filePath: string,
    scope?: VoxCredentialScope,
  ): Promise<{ words: VoxAlignedWord[]; durationMs: number }> {
    const credentialScope = resolveCredentialScope(scope);
    const apiKey = await getProviderApiKeyWithScope("openai", {
      allowManaged: credentialScope.allowManagedCredentials,
      allowLocal: credentialScope.allowLocalCredentials,
    });
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
