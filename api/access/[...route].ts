import express from "express";

import { createAccessRouter } from "../../server/access/routes";
import { LineaAccessService } from "../../server/access/service";
import { loadServerEnv } from "../../server/load-env";

loadServerEnv(process.cwd());

const app = express();
const access = new LineaAccessService();

app.use(access.middleware());
app.use("/api/access", createAccessRouter(access));

export default app;
