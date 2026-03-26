import fs from "node:fs/promises";
import path from "node:path";

import { get } from "@vercel/blob";

import type { VoxCacheEntry } from "./types";

const SEEDED_BLOB_MANIFEST_PATH = "demo/attention/manifest.json";
const LOCAL_SEEDED_MANIFEST_PATH = path.join(process.cwd(), "server", "vox", "seeded-cache.json");

let manifestPromise: Promise<Record<string, VoxCacheEntry>> | null = null;

async function readLocalManifest() {
  try {
    const raw = await fs.readFile(LOCAL_SEEDED_MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Record<string, VoxCacheEntry>;
  } catch {
    return {};
  }
}

async function readBlobManifest() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return null;
  }

  try {
    const response = await get(SEEDED_BLOB_MANIFEST_PATH, {
      access: "public",
      token,
    });

    if (!response || response.statusCode !== 200 || !response.stream) {
      return null;
    }

    const raw = await new Response(response.stream).text();
    return JSON.parse(raw) as Record<string, VoxCacheEntry>;
  } catch (error) {
    console.warn("[linea:vox] seeded-manifest-blob-unavailable", {
      pathname: SEEDED_BLOB_MANIFEST_PATH,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

async function loadSeededCacheEntries() {
  const blobManifest = await readBlobManifest();
  if (blobManifest) {
    return blobManifest;
  }

  return readLocalManifest();
}

export async function getSeededCacheEntries() {
  if (!manifestPromise) {
    manifestPromise = loadSeededCacheEntries();
  }

  return manifestPromise;
}

export function resetSeededCacheEntries() {
  manifestPromise = null;
}

export { SEEDED_BLOB_MANIFEST_PATH };
