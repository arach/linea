import fs from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";

import { loadServerEnv } from "../server/load-env";
import { SEEDED_BLOB_MANIFEST_PATH } from "../server/vox/seeded-cache";
import type { VoxCacheEntry } from "../server/vox/types";

const repoRoot = path.resolve(import.meta.dir, "..");
const localManifestPath = path.join(repoRoot, "server", "vox", "seeded-cache.json");
const localAudioDir = path.join(repoRoot, "public", "vox-cache");
const demoAudioPrefix = "demo/attention/audio";

async function main() {
  loadServerEnv(repoRoot);

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not available. Pull Vercel envs before uploading.");
  }

  const rawManifest = await fs.readFile(localManifestPath, "utf8");
  const localManifest = JSON.parse(rawManifest) as Record<string, VoxCacheEntry>;
  const remoteManifest: Record<string, VoxCacheEntry> = {};
  const entries = Object.entries(localManifest);

  if (entries.length === 0) {
    throw new Error("Local seeded manifest is empty. Run bun run seed:attention-demo first.");
  }

  for (const [cacheKey, entry] of entries) {
    const audioPath = path.join(localAudioDir, `${cacheKey}.mp3`);
    const pathname = `${demoAudioPrefix}/${cacheKey}.mp3`;
    const audioFile = Bun.file(audioPath);

    if (!(await audioFile.exists())) {
      throw new Error(`Missing local audio file for ${cacheKey}: ${audioPath}`);
    }

    const uploadedAudio = await put(pathname, audioFile, {
      access: "public",
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 31536000,
      contentType: "audio/mpeg",
    });

    remoteManifest[cacheKey] = {
      ...entry,
      filePath: null,
      audioUrl: uploadedAudio.url,
      immutable: true,
    };

    console.log(`Uploaded ${pathname}`);
  }

  const manifestBody = JSON.stringify(remoteManifest, null, 2);
  const uploadedManifest = await put(SEEDED_BLOB_MANIFEST_PATH, manifestBody, {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 300,
    contentType: "application/json; charset=utf-8",
  });

  console.log(`Uploaded manifest: ${uploadedManifest.url}`);
  console.log(`Entries: ${entries.length}`);
}

await main();
