import fs from "node:fs/promises";
import path from "node:path";

import express from "express";
import { createServer as createViteServer } from "vite";

import { createAccessRouter } from "./access/routes";
import { LineaAccessService } from "./access/service";
import { createLineaRouter } from "./linea/routes";
import { loadServerEnv } from "./load-env";
import { createVoxRouter } from "./vox/routes";

function serializeState(value: unknown) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

const root = process.cwd();
loadServerEnv(root);
const app = express();
const port = Number(process.env.PORT ?? 5173);
const access = new LineaAccessService();

const vite = await createViteServer({
  root,
  appType: "custom",
  server: {
    middlewareMode: true,
  },
});

app.use(access.middleware());
app.use("/api/access", createAccessRouter(access));
app.use("/api/linea", createLineaRouter());
app.use("/api/vox", createVoxRouter(access));
app.use(vite.middlewares);

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found" });
    return;
  }

  next();
});

app.use(async (req, res, next) => {
  try {
    const url = req.originalUrl;
    let template = await fs.readFile(path.resolve(root, "index.html"), "utf-8");
    template = await vite.transformIndexHtml(url, template);

    const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");
    const rendered = await render(url);

    const html = template
      .replace("<!--app-head-->", rendered.head ?? "")
      .replace("<!--app-html-->", rendered.html)
      .replace(
        "<!--app-state-->",
        `<script>window.__INITIAL_STATE__=${serializeState(rendered.initialState)};</script>`,
      );

    res.status(200).setHeader("Content-Type", "text/html").end(html);
  } catch (error) {
    vite.ssrFixStacktrace(error as Error);
    next(error);
  }
});

app.listen(port, () => {
  console.log(`Linea dev server running at http://localhost:${port}`);
});
