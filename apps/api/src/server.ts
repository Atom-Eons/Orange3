import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { healthRouter } from "./routes/health.js";
import { agentRunRouter } from "./routes/agentRun.js";
import { artifactsRouter } from "./routes/artifacts.js";
import { memoryRouter } from "./routes/memory.js";
import { metricsRouter } from "./routes/metrics.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { toolsRouter } from "./routes/tools.js";
import { optionalAuth } from "./security/auth.js";

const app = express();

const allowedOrigins = new Set([env.WEB_ORIGIN, "http://127.0.0.1:5173", "http://localhost:5173"]);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by AE See-Suite API CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "5mb" }));
app.use(optionalAuth);

app.use("/api/health", healthRouter);
app.use("/api/agent", agentRunRouter);
app.use("/api/artifacts", artifactsRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/workspaces", workspacesRouter);
app.use("/api/tools", toolsRouter);

app.listen(env.API_PORT, () => {
  console.log(`AE See-Suite API listening on :${env.API_PORT}`);
});
