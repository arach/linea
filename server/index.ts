import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import express from "express";

import { loadServerEnv } from "./load-env";
import { createVoxRouter } from "./vox/routes";

function serializeState(value: unknown) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadServerEnv(path.resolve(__dirname, ".."));
const clientDist = path.resolve(__dirname, "./client");
const serverDist = path.resolve(__dirname, "./server");
const port = Number(process.env.PORT ?? 4173);

const template = await fs.readFile(path.resolve(clientDist, "index.html"), "utf-8");
const app = express();

app.use("/api/vox", createVoxRouter());
app.use(
  express.static(clientDist, {
    index: false,
    extensions: ["html"],
  }),
);

app.use(async (req, res, next) => {
  try {
    const entryServerUrl = pathToFileURL(path.resolve(serverDist, "entry-server.js")).href;
    const { render } = await import(entryServerUrl);
    const rendered = await render(req.originalUrl);

    const html = template
      .replace("<!--app-head-->", rendered.head ?? "")
      .replace("<!--app-html-->", rendered.html)
      .replace(
        "<!--app-state-->",
        `<script>window.__INITIAL_STATE__=${serializeState(rendered.initialState)};</script>`,
      );

    res.status(200).setHeader("Content-Type", "text/html").end(html);
  } catch (error) {
    next(error);
  }
});

app.listen(port, () => {
  console.log(`Linea server running at http://localhost:${port}`);
});
