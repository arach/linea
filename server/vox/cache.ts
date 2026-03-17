import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { VoxProviderId, VoxSynthesisRequest } from "../../src/lib/vox";
import type { VoxCacheEntry } from "./types";

const CACHE_ROOT = path.join(os.homedir(), ".linea", "vox-cache");

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export class VoxCache {
  async ensureCacheDir() {
    await fs.mkdir(CACHE_ROOT, { recursive: true });
  }

  generateKey(input: {
    provider: VoxProviderId;
    voice: string;
    rate: number;
    text: string;
    instructions?: string;
  }) {
    const hash = crypto.createHash("sha256");
    hash.update(
      JSON.stringify({
        provider: input.provider,
        voice: input.voice,
        rate: input.rate,
        text: normalizeText(input.text),
        instructions: input.instructions ?? "",
      }),
    );

    return hash.digest("hex");
  }

  private audioPath(cacheKey: string) {
    return path.join(CACHE_ROOT, `${cacheKey}.mp3`);
  }

  private metadataPath(cacheKey: string) {
    return path.join(CACHE_ROOT, `${cacheKey}.json`);
  }

  async get(cacheKey: string) {
    await this.ensureCacheDir();

    try {
      const [metadataRaw] = await Promise.all([
        fs.readFile(this.metadataPath(cacheKey), "utf8"),
        fs.access(this.audioPath(cacheKey)),
      ]);

      return JSON.parse(metadataRaw) as VoxCacheEntry;
    } catch {
      return null;
    }
  }

  async set(input: {
    cacheKey: string;
    provider: VoxProviderId;
    voice: string;
    rate: number;
    text: string;
    audio: Buffer;
    source?: VoxSynthesisRequest["source"];
  }) {
    await this.ensureCacheDir();

    const entry: VoxCacheEntry = {
      cacheKey: input.cacheKey,
      provider: input.provider,
      voice: input.voice,
      rate: input.rate,
      format: "mp3",
      filePath: this.audioPath(input.cacheKey),
      text: input.text,
      createdAt: new Date().toISOString(),
      source: input.source,
    };

    await Promise.all([
      fs.writeFile(entry.filePath, input.audio),
      fs.writeFile(this.metadataPath(input.cacheKey), JSON.stringify(entry, null, 2)),
    ]);

    return entry;
  }

  getAudioPath(cacheKey: string) {
    return this.audioPath(cacheKey);
  }
}
