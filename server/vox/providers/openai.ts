import type { VoxProvider } from "../types";

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

export class OpenAIVoxProvider implements VoxProvider {
  readonly id = "openai";
  readonly label = "OpenAI";
  readonly defaultVoice = process.env.OPENAI_TTS_VOICE ?? "alloy";

  private apiKey = process.env.OPENAI_API_KEY ?? "";
  private model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

  isAvailable() {
    return this.apiKey.length > 0;
  }

  async synthesize(config: { text: string; voice: string; rate: number; instructions?: string }) {
    if (!this.isAvailable()) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const response = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        voice: config.voice || this.defaultVoice,
        input: config.text,
        speed: config.rate,
        format: "mp3",
        instructions: config.instructions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS failed with ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
