import express from "express";

import { LineaAccessService } from "./service";

export function createAccessRouter(access = new LineaAccessService()) {
  const router = express.Router();

  router.get("/session", async (req, res) => {
    try {
      res.json({
        session: await access.getSessionSnapshot(req),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Could not load managed access.",
      });
    }
  });

  return router;
}
