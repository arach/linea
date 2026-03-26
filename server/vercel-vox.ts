import express from "express";

import { LineaAccessService } from "./access/service";
import { loadServerEnv } from "./load-env";
import { createVoxRouter } from "./vox/routes";

loadServerEnv(process.cwd());

const app = express();
const access = new LineaAccessService();
const router = createVoxRouter(access);

app.use(access.middleware());
app.use("/api/vox", router);
app.use("/", router);

export default app;
