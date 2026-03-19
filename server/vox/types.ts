import type { VoxProviderId, VoxSynthesisRequest } from "../../src/lib/vox";

export type VoxProviderConfig = {
  text: string;
  voice: string;
  rate: number;
  instructions?: string;
};

export type VoxCacheEntry = {
  cacheKey: string;
  provider: VoxProviderId;
  voice: string;
  rate: number;
  format: "mp3";
  filePath: string;
  text: string;
  createdAt: string;
  source?: VoxSynthesisRequest["source"];
};

export interface VoxProvider {
  id: VoxProviderId;
  label: string;
  defaultVoice: string;
  isAvailable(): Promise<boolean>;
  synthesize(config: VoxProviderConfig): Promise<Buffer>;
}
