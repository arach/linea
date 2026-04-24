import express from "express";

import { LineaAccessService } from "./access/service";
import { createLineaRouter } from "./linea/routes";
import { loadServerEnv } from "./load-env";

loadServerEnv(process.cwd());

const app = express();
const access = new LineaAccessService();
const router = createLineaRouter();

app.use(access.middleware());
app.use("/api/linea", router);
app.use("/", router);

export default app;
