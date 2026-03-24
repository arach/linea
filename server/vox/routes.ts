import fs from "node:fs/promises";

import express from "express";

import type { LineaVoiceProviderId, LineaVoiceSynthesisRequest } from "../../src/lib/linea-voice";
import { getManagedAccessConfig } from "../access/config";
import { LineaAccessError, LineaAccessService } from "../access/service";
import { VoxService } from "./service";

function parseProviderId(value: string): LineaVoiceProviderId | null {
  if (value === "openai" || value === "elevenlabs") {
    return value;
  }

  return null;
}

export function createVoxRouter(access = new LineaAccessService()) {
  const router = express.Router();
  const vox = new VoxService();
  const jsonBody = express.json({ limit: "2mb" });
  const managedAccessEnabled = getManagedAccessConfig().managedAccessEnabled;

  router.get("/providers", async (req, res) => {
    const credentialScope = await access.getCredentialScope(req);
    res.json({
      providers: await vox.listProviders(credentialScope),
    });
  });

  router.get("/capabilities", async (req, res) => {
    const credentialScope = await access.getCredentialScope(req);
    res.json({
      capabilities: await vox.getCapabilities(credentialScope),
    });
  });

  router.get("/providers/:provider/voices", async (req, res) => {
    try {
      const provider = parseProviderId(req.params.provider);

      if (!provider) {
        res.status(400).json({ error: "Unsupported provider" });
        return;
      }

      const credentialScope = await access.getCredentialScope(req);
      res.json({
        voices: await vox.listVoices(provider, credentialScope),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Voice discovery failed",
      });
    }
  });

  router.get("/credentials", async (req, res) => {
    const credentialScope = await access.getCredentialScope(req);
    res.json({
      credentials: await vox.listCredentialStatuses(credentialScope),
    });
  });

  router.put("/credentials/:provider", jsonBody, async (req, res) => {
    try {
      if (managedAccessEnabled && !getManagedAccessConfig().localCredentialsEnabled) {
        res.status(403).json({
          error: "Local credential management is disabled while managed access is enabled.",
        });
        return;
      }

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
      if (managedAccessEnabled && !getManagedAccessConfig().localCredentialsEnabled) {
        res.status(403).json({
          error: "Local credential management is disabled while managed access is enabled.",
        });
        return;
      }

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
      const payload = req.body as LineaVoiceSynthesisRequest;

      if (!payload?.text?.trim()) {
        res.status(400).json({ error: "Text is required" });
        return;
      }

      const credentialScope = await access.getCredentialScope(req);
      const session = managedAccessEnabled
        ? await access.assertCapability(req, "managed-voice", payload.text.length)
        : null;
      const response = await vox.synthesize(payload, credentialScope);

      if (session && !response.cached) {
        await access.recordManagedUsage(session, {
          kind: "tts_chars",
          units: payload.text.length,
          provider: payload.provider,
          cacheKey: response.cacheKey,
          metadata: {
            cached: false,
            pageNumber: payload.source?.pageNumber ?? null,
            paragraphId: payload.source?.paragraphId ?? null,
          },
        });
      }

      res.json(response);
    } catch (error) {
      console.error("[linea:vox] synth-failed", {
        provider: (req.body as LineaVoiceSynthesisRequest | undefined)?.provider ?? null,
        voice: (req.body as LineaVoiceSynthesisRequest | undefined)?.voice ?? null,
        error: error instanceof Error ? error.message : "Synthesis failed",
      });
      res.status(error instanceof LineaAccessError ? error.statusCode : 500).json({
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

  // Align audio: run Whisper ASR to get word-level timestamps
  router.post("/align/:cacheKey", async (req, res) => {
    try {
      const credentialScope = await access.getCredentialScope(req);
      const cacheEntry = await vox.getCacheEntry(req.params.cacheKey);
      const estimatedUnits = cacheEntry
        ? access.estimateAlignmentSeconds(cacheEntry.text, cacheEntry.rate)
        : 0;
      const hadAlignment = Boolean(cacheEntry?.alignment);
      const session = managedAccessEnabled
        ? await access.assertCapability(req, "managed-alignment", estimatedUnits)
        : null;
      const alignment = await vox.align(req.params.cacheKey, credentialScope);

      if (session && alignment && !hadAlignment) {
        await access.recordManagedUsage(session, {
          kind: "transcription_seconds",
          units: Math.max(1, Math.round(alignment.durationMs / 1000)),
          provider: "openai",
          cacheKey: req.params.cacheKey,
          metadata: {
            estimatedUnits,
            textLength: cacheEntry?.text.length ?? 0,
          },
        });
      }

      res.json({ alignment });
    } catch (error) {
      console.error("[linea:vox] align-failed", {
        cacheKey: req.params.cacheKey,
        error: error instanceof Error ? error.message : "Alignment failed",
      });
      res.status(error instanceof LineaAccessError ? error.statusCode : 500).json({
        error: error instanceof Error ? error.message : "Alignment failed",
      });
    }
  });

  // Get cached alignment (no Whisper call)
  router.get("/align/:cacheKey", async (req, res) => {
    try {
      const alignment = await vox.getAlignment(req.params.cacheKey);
      res.json({ alignment });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get alignment",
      });
    }
  });

  return router;
}
