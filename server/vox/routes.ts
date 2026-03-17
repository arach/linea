import fs from "node:fs/promises";

import express from "express";

import type { VoxSynthesisRequest } from "../../src/lib/vox";
import { VoxService } from "./service";

export function createVoxRouter() {
  const router = express.Router();
  const vox = new VoxService();

  router.get("/providers", (_req, res) => {
    res.json({
      providers: vox.listProviders(),
    });
  });

  router.post("/synthesize", express.json({ limit: "2mb" }), async (req, res) => {
    try {
      const payload = req.body as VoxSynthesisRequest;

      if (!payload?.text?.trim()) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const response = await vox.synthesize(payload);
      res.json(response);
    } catch (error) {
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
