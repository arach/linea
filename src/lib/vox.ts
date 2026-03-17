export type VoxProviderId = "openai" | "elevenlabs";

export type VoxSynthesisRequest = {
  provider: VoxProviderId;
  text: string;
  voice: string;
  rate?: number;
  instructions?: string;
  format?: "mp3";
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
  format: "mp3";
  cached: boolean;
  audioUrl: string;
  source?: VoxSynthesisRequest["source"];
};

export type VoxProviderStatus = {
  id: VoxProviderId;
  label: string;
  available: boolean;
  defaultVoice: string;
};
