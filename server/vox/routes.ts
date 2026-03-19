import fs from "node:fs/promises";

import express from "express";

import type { VoxProviderId, VoxSynthesisRequest } from "../../src/lib/vox";
import { VoxService } from "./service";

function parseProviderId(value: string): VoxProviderId | null {
  if (value === "openai" || value === "elevenlabs") {
    return value;
  }

  return null;
}

export function createVoxRouter() {
  const router = express.Router();
  const vox = new VoxService();
  const jsonBody = express.json({ limit: "2mb" });

  router.get("/providers", async (_req, res) => {
    res.json({
      providers: await vox.listProviders(),
    });
  });

  router.get("/providers/:provider/voices", async (req, res) => {
    try {
      const provider = parseProviderId(req.params.provider);

      if (!provider) {
        res.status(400).json({ error: "Unsupported provider" });
        return;
      }

      res.json({
        voices: await vox.listVoices(provider),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Voice discovery failed",
      });
    }
  });

  router.get("/credentials", async (_req, res) => {
    res.json({
      credentials: await vox.listCredentialStatuses(),
    });
  });

  router.put("/credentials/:provider", jsonBody, async (req, res) => {
    try {
      const provider = parseProviderId(req.params.provider);
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

      if (!provider) {
        res.status(400).json({ error: "Unsupported provider" });
        return;
      }

      if (!apiKey) {
        res.status(400).json({ error: "API key is required" });
        return;
      }

      const credential = await vox.setCredential(provider, apiKey);

      res.status(201).json({
        credential,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Could not save credential",
      });
    }
  });

  router.delete("/credentials/:provider", async (req, res) => {
    try {
      const provider = parseProviderId(req.params.provider);

      if (!provider) {
        res.status(400).json({ error: "Unsupported provider" });
        return;
      }

      const credential = await vox.deleteCredential(provider);

      res.json({
        credential,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Could not delete credential",
      });
    }
  });

  router.post("/synthesize", jsonBody, async (req, res) => {
    try {
      const payload = req.body as VoxSynthesisRequest;

      if (!payload?.text?.trim()) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const response = await vox.synthesize(payload);
      res.json(response);
    } catch (error) {
      console.error("[linea:vox] synth-failed", {
        provider: (req.body as VoxSynthesisRequest | undefined)?.provider ?? null,
        voice: (req.body as VoxSynthesisRequest | undefined)?.voice ?? null,
        error: error instanceof Error ? error.message : "Synthesis failed",
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Synthesis failed",
      });
    }
  });

  router.get("/audio/:cacheKey", async (req, res) => {
    const filePath = await vox.resolveAudioPath(req.params.cacheKey);

    if (!filePath) {
      res.status(404).json({ error: "Audio not found" });
      return;
    }

    const audio = await fs.readFile(filePath);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(audio);
  });

  return router;
}
