import type { VoxProvider } from "../types";

export class ElevenLabsVoxProvider implements VoxProvider {
  readonly id = "elevenlabs";
  readonly label = "ElevenLabs";
  readonly defaultVoice = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";

  private apiKey = process.env.ELEVENLABS_API_KEY ?? "";
  private modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";

  isAvailable() {
    return this.apiKey.length > 0;
  }

  async synthesize(config: { text: string; voice: string; rate: number }) {
    if (!this.isAvailable()) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.voice || this.defaultVoice}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
        },
        body: JSON.stringify({
          text: config.text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.7,
            style: 0.18,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS failed with ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
