import express from "express";

import { LineaAccessService } from "../../server/access/service";
import { loadServerEnv } from "../../server/load-env";
import { createVoxRouter } from "../../server/vox/routes";

loadServerEnv(process.cwd());

const app = express();
const access = new LineaAccessService();

app.use(access.middleware());
app.use("/api/vox", createVoxRouter(access));

export default app;
