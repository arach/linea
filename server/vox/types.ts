import type { LineaVoiceProviderId, LineaVoiceSynthesisRequest } from "../../src/lib/linea-voice";

export type VoxProviderConfig = {
  text: string;
  voice: string;
  rate: number;
  instructions?: string;
};

export type VoxAlignedWord = {
  word: string;
  start: number;   // seconds
  end: number;      // seconds
};

export type VoxAlignment = {
  words: VoxAlignedWord[];
  durationMs: number;
  createdAt: string;
};

export type VoxCacheEntry = {
  cacheKey: string;
  provider: LineaVoiceProviderId;
  voice: string;
  rate: number;
  format: "mp3";
  filePath: string;
  text: string;
  createdAt: string;
  source?: LineaVoiceSynthesisRequest["source"];
  alignment?: VoxAlignment;
};

export interface VoxProvider {
  id: LineaVoiceProviderId;
  label: string;
  defaultVoice: string;
  isAvailable(): Promise<boolean>;
  synthesize(config: VoxProviderConfig): Promise<Buffer>;
}
