import express from "express";

import { parseBundledSamplePageWithLiteParse } from "./services/ocr";

export function createLineaRouter() {
  const router = express.Router();
  const jsonBody = express.json({ limit: "2mb" });

  router.post("/services/ocr/page", jsonBody, async (req, res) => {
    try {
      const sampleFile = typeof req.body?.sampleFile === "string" ? req.body.sampleFile.trim() : "";
      const page = Number(req.body?.page);
      const language = typeof req.body?.language === "string" ? req.body.language.trim() : undefined;

      if (!sampleFile) {
        res.status(400).json({ error: "Sample file is required." });
        return;
      }

      if (!Number.isInteger(page) || page < 1) {
        res.status(400).json({ error: "Page must be a positive integer." });
        return;
      }

      const result = await parseBundledSamplePageWithLiteParse({
        sampleFile,
        page,
        language,
      });

      res.json({ result });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "LiteParse OCR failed",
      });
    }
  });

  return router;
}
