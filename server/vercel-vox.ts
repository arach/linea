import express from "express";

import { LineaAccessService } from "./access/service";
import { loadServerEnv } from "./load-env";
import { createVoxRouter } from "./vox/routes";

loadServerEnv(process.cwd());

const app = express();
const access = new LineaAccessService();

app.use(access.middleware());
app.use("/api/vox", createVoxRouter(access));

export default app;
