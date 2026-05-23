import { Hono } from "hono";
import type { ProviderSettingsState } from "../services/providerSettings";

// Profile-aware model list. The old version called Anthropic /v1/models
// upstream; that doesn't work for DeepSeek (incomplete compat layer) and
// adds latency for no real gain — model lists are slow-changing curated
// data. We just return whatever the current profile defines.
//
// Frontend uses this for the picker dropdown. The response shape stays
// `{ data: [{id, displayName, description}] }` so existing clients don't break.
export function buildModelsRoutes(provider: ProviderSettingsState): Hono {
  const app = new Hono();

  app.get("/models", (c) => {
    const current = provider.current();
    return c.json({ data: current.models });
  });

  return app;
}
