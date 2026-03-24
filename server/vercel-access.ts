import express from "express";

import { createAccessRouter } from "./access/routes";
import { LineaAccessService } from "./access/service";
import { loadServerEnv } from "./load-env";

loadServerEnv(process.cwd());

const app = express();
const access = new LineaAccessService();

app.use(access.middleware());
app.use("/api/access", createAccessRouter(access));

export default app;
