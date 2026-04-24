import express from "express";

import { clearDirectXSession, handleDirectXCallback, startDirectXAuth } from "./direct-x";
import { LineaAccessService } from "./service";

export function createAccessRouter(access = new LineaAccessService()) {
  const router = express.Router();

  router.get("/auth/x/start", (req, res) => {
    startDirectXAuth(req, res);
  });

  router.get("/auth/x/callback", async (req, res) => {
    await handleDirectXCallback(req, res);
  });

  router.get("/sign-out", (req, res) => {
    clearDirectXSession(req, res);

    const returnTo = typeof req.query.return_to === "string" ? req.query.return_to : "/";
    res.redirect(returnTo.startsWith("/") ? returnTo : "/");
  });

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
