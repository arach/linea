import type {
  VoxProviderId,
  VoxProviderStatus,
  VoxSynthesisRequest,
  VoxSynthesisResponse,
} from "../../src/lib/vox";
import { VoxCache } from "./cache";
import { ElevenLabsVoxProvider } from "./providers/elevenlabs";
import { OpenAIVoxProvider } from "./providers/openai";
import type { VoxProvider } from "./types";

export class VoxService {
  private cache = new VoxCache();
  private providers: Record<VoxProviderId, VoxProvider> = {
    openai: new OpenAIVoxProvider(),
    elevenlabs: new ElevenLabsVoxProvider(),
  };

  listProviders(): VoxProviderStatus[] {
    return Object.values(this.providers).map((provider) => ({
      id: provider.id,
      label: provider.label,
      available: provider.isAvailable(),
      defaultVoice: provider.defaultVoice,
    }));
  }

  async synthesize(request: VoxSynthesisRequest): Promise<VoxSynthesisResponse> {
    const provider = this.providers[request.provider];
    if (!provider) {
      throw new Error(`Unsupported provider: ${request.provider}`);
    }

    if (!provider.isAvailable()) {
      throw new Error(`${provider.label} is not configured on this machine`);
    }

    const rate = request.rate ?? 1;
    const voice = request.voice || provider.defaultVoice;
    const cacheKey = this.cache.generateKey({
      provider: provider.id,
      voice,
      rate,
      text: request.text,
      instructions: request.instructions,
    });

    const cachedEntry = await this.cache.get(cacheKey);
    if (cachedEntry) {
      return {
        cacheKey,
        provider: provider.id,
        voice,
        rate,
        format: "mp3",
        cached: true,
        audioUrl: `/api/vox/audio/${cacheKey}`,
        source: cachedEntry.source,
      };
    }

    const audio = await provider.synthesize({
      text: request.text,
      voice,
      rate,
      instructions: request.instructions,
    });

    await this.cache.set({
      cacheKey,
      provider: provider.id,
      voice,
      rate,
      text: request.text,
      audio,
      source: request.source,
    });

    return {
      cacheKey,
      provider: provider.id,
      voice,
      rate,
      format: "mp3",
      cached: false,
      audioUrl: `/api/vox/audio/${cacheKey}`,
      source: request.source,
    };
  }

  async resolveAudioPath(cacheKey: string) {
    const cachedEntry = await this.cache.get(cacheKey);
    return cachedEntry?.filePath ?? null;
  }
}
