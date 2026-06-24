import { Hono } from "hono";
import { detectAudioToolStatus } from "../services/audioToolStatus";

export function buildAudioToolRoutes(): Hono {
  const app = new Hono();
  app.get("/tools/audio/status", (c) => c.json(detectAudioToolStatus()));
  return app;
}
