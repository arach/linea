import crypto from "node:crypto";

import {
  OraRuntime,
  createOpenAiTtsProvider,
  type OraSynthesisContext,
  type OraSynthesisRequest,
  type OraSynthesisResponse,
  type OraTtsProvider,
} from "@arach/ora";

import { getElevenLabsVoiceId, getOpenAIVoice, getProviderApiKey } from "./config";

const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;

type OraVoice = {
  id: string;
  label: string;
  provider: "openai" | "elevenlabs";
  locale?: string;
  tags?: string[];
  previewText?: string;
  previewUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

type OraTtsProviderWithLabel = OraTtsProvider & {
  label?: string;
  listVoices?: () => Promise<OraVoice[]> | OraVoice[];
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createOpenAiOraProvider(): OraTtsProviderWithLabel {
  const provider = createOpenAiTtsProvider({
    defaultVoice: getOpenAIVoice() || "alloy",
  });

  return {
    ...provider,
    label: "OpenAI",
    async listVoices() {
      return OPENAI_VOICES.map((voiceId) => ({
        id: voiceId,
        label: titleCase(voiceId),
        provider: "openai",
      })) satisfies OraVoice[];
    },
  };
}

async function listElevenLabsVoices(apiKey: string): Promise<OraVoice[]> {
  const subscriptionResponse = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  let subscriptionTier: string | null = null;

  if (subscriptionResponse.ok) {
    const subscription = (await subscriptionResponse.json()) as {
      tier?: string;
      status?: string;
    };

    subscriptionTier = subscription.tier ?? subscription.status ?? null;
  }

  const response = await fetch("https://api.elevenlabs.io/v2/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs voice discovery failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    voices?: Array<{
      voice_id?: string;
      name?: string;
      category?: string;
      labels?: Record<string, string>;
      preview_url?: string | null;
      is_owner?: boolean;
      sharing?: {
        free_users_allowed?: boolean;
      } | null;
    }>;
  };

  const voices: OraVoice[] = [];

  for (const voice of payload.voices ?? []) {
    const voiceId = voice.voice_id?.trim();
    if (!voiceId) {
      continue;
    }

    const isSafeForThisPlan =
      subscriptionTier === "free"
        ? voice.category === "premade" || voice.is_owner === true
        : true;
    if (!isSafeForThisPlan) {
      continue;
    }

    voices.push({
      id: voiceId,
      label: voice.name?.trim() || voiceId,
      provider: "elevenlabs",
      previewUrl: voice.preview_url ?? undefined,
      tags: Object.values(voice.labels ?? {}).filter(Boolean),
      metadata: {
        ...(voice.labels ?? {}),
        category: voice.category ?? null,
        tier: subscriptionTier,
        free_users_allowed: voice.sharing?.free_users_allowed ?? null,
      },
    });
  }

  return voices;
}

function createElevenLabsOraProvider(): OraTtsProviderWithLabel {
  const defaultVoice = process.env.ELEVENLABS_VOICE_ID ?? getElevenLabsVoiceId() ?? "EXAVITQu4vr4xnSDxMaL";
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

  return {
    id: "elevenlabs",
    label: "ElevenLabs",
    async listVoices() {
      const apiKey = await getProviderApiKey("elevenlabs");

      if (!apiKey) {
        return [
          {
            id: defaultVoice,
            label: "Default ElevenLabs Voice",
            provider: "elevenlabs",
            tags: ["default"],
          },
        ];
      }

      const voices = await listElevenLabsVoices(apiKey);

      if (voices.length === 0) {
        return [
          {
            id: defaultVoice,
            label: "Default ElevenLabs Voice",
            provider: "elevenlabs",
            tags: ["default"],
          },
        ];
      }

      return voices;
    },
    async synthesize(
      request: OraSynthesisRequest,
      context: OraSynthesisContext,
    ): Promise<OraSynthesisResponse> {
      const apiKey = (await getProviderApiKey("elevenlabs")) || context.credentials.apiKey || "";

      if (!apiKey) {
        throw new Error("ElevenLabs TTS requires an apiKey credential.");
      }

      const voice = request.voice || defaultVoice;
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: request.text,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.7,
            style: 0.18,
            use_speaker_boost: true,
          },
        }),
        signal: context.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          detail
            ? `ElevenLabs TTS failed with ${response.status}: ${detail.slice(0, 240)}`
            : `ElevenLabs TTS failed with ${response.status}`,
        );
      }

      const audioData = new Uint8Array(await response.arrayBuffer());

      return {
        requestId: context.requestId,
        cacheKey: crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              provider: "elevenlabs",
              voice,
              text: request.text,
              rate: request.rate ?? 1,
              format: request.format ?? context.plan.format,
            }),
          )
          .digest("hex"),
        provider: "elevenlabs",
        voice,
        rate: request.rate ?? 1,
        format: request.format ?? context.plan.format,
        cached: false,
        audioUrl: `elevenlabs://audio/${context.requestId}`,
        audioData,
        mimeType: "audio/mpeg",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        metadata: {
          model: modelId,
        },
      };
    },
  };
}

export function createVoxOraRuntime() {
  const providers = {
    openai: createOpenAiOraProvider(),
    elevenlabs: createElevenLabsOraProvider(),
  } as const;

  const runtime = new OraRuntime({
    providers: Object.values(providers),
  });

  return {
    runtime,
    providers,
  };
}
