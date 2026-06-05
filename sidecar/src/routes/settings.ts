import { Hono } from "hono";
import type { ProviderSettingsState } from "../services/providerSettings";
import type { UserProfileSettingsState } from "../services/userProfileSettings";
import {
  BUILT_IN_PROFILES,
  isBuiltInProfileId,
  type ProfileModel,
  type ProviderProfileId,
} from "../lib/providerProfiles";

function isValidProfileId(v: unknown): v is ProviderProfileId {
  return typeof v === "string" && (isBuiltInProfileId(v) || v === "custom");
}

function modelListUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.endsWith("/v1")
      ? `${pathname}/models`
      : `${pathname}/v1/models`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeFetchedModels(raw: unknown): ProfileModel[] {
  const data =
    raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : Array.isArray(raw)
        ? raw
        : [];

  const seen = new Set<string>();
  const models: ProfileModel[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id.trim()) continue;
    const id = record.id.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    const displayName =
      typeof record.displayName === "string" && record.displayName.trim()
        ? record.displayName.trim()
        : typeof record.display_name === "string" && record.display_name.trim()
          ? record.display_name.trim()
          : id;
    const description =
      typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : "Fetched from provider";
    models.push({ id, displayName, description });
  }
  return models;
}

export function buildSettingsRoutes(
  provider: ProviderSettingsState,
  userProfile: UserProfileSettingsState,
): Hono {
  const app = new Hono();

  // Legacy API-key endpoint — kept so existing frontend code keeps working.
  // Writes through to the new provider state so the api key sticks across
  // restarts (previously it was in-memory only).
  app.post("/settings/api-key", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { apiKey?: string | null }
      | null;
    if (body === null) return c.json({ error: "invalid_body" }, 400);
    if (body.apiKey !== null && typeof body.apiKey !== "string") {
      return c.json({ error: "invalid_api_key" }, 400);
    }
    provider.update({ apiKey: body.apiKey ?? "" });
    return c.json({ ok: true });
  });

  // GET current provider config + built-in profile catalog. Frontend reads
  // this on Settings page load + on the model picker open.
  app.get("/settings/provider", (c) => {
    return c.json({
      current: provider.current(),
      builtIn: BUILT_IN_PROFILES,
    });
  });

  // PATCH-style update. Caller sends only the fields they want to change;
  // omitted fields keep prior value. apiKey is intentionally writable here
  // (in addition to the legacy /settings/api-key) so the new Provider UI
  // can save profile + key in one POST.
  app.post("/settings/provider", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | {
          profileId?: unknown;
          baseUrl?: unknown;
          apiKey?: unknown;
          selectedModelId?: unknown;
          customModels?: unknown;
          customModelSource?: unknown;
        }
      | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const patch: Parameters<ProviderSettingsState["update"]>[0] = {};
    if (body.profileId !== undefined) {
      if (!isValidProfileId(body.profileId)) {
        return c.json({ error: "invalid_profile_id" }, 400);
      }
      patch.profileId = body.profileId;
    }
    if (body.baseUrl !== undefined) {
      if (typeof body.baseUrl !== "string") {
        return c.json({ error: "invalid_base_url" }, 400);
      }
      patch.baseUrl = body.baseUrl;
    }
    if (body.apiKey !== undefined) {
      if (typeof body.apiKey !== "string") {
        return c.json({ error: "invalid_api_key" }, 400);
      }
      patch.apiKey = body.apiKey;
    }
    if (body.customModelSource !== undefined) {
      return c.json({ error: "unsupported_model_source" }, 400);
    }
    if (body.customModels !== undefined) {
      return c.json({ error: "unsupported_custom_models" }, 400);
    }
    if (body.selectedModelId !== undefined) {
      if (
        body.selectedModelId !== null &&
        typeof body.selectedModelId !== "string"
      ) {
        return c.json({ error: "invalid_selected_model_id" }, 400);
      }
      patch.selectedModelId = body.selectedModelId;
    }
    const next = provider.update(patch);
    return c.json({ current: next });
  });

  app.post("/settings/provider/fetch-models", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | {
          profileId?: unknown;
          baseUrl?: unknown;
          apiKey?: unknown;
        }
      | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);
    if (body.profileId !== undefined && !isValidProfileId(body.profileId)) {
      return c.json({ error: "invalid_profile_id" }, 400);
    }
    if (body.baseUrl !== undefined && typeof body.baseUrl !== "string") {
      return c.json({ error: "invalid_base_url" }, 400);
    }
    if (body.apiKey !== undefined && typeof body.apiKey !== "string") {
      return c.json({ error: "invalid_api_key" }, 400);
    }

    const current = provider.current();
    const baseUrl =
      typeof body.baseUrl === "string" ? body.baseUrl : current.baseUrl;
    const apiKey =
      typeof body.apiKey === "string" ? body.apiKey : current.apiKey;
    const url = modelListUrl(baseUrl);
    if (!url) return c.json({ error: "invalid_base_url" }, 400);

    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      });
    } catch {
      return c.json({ error: "fetch_failed" }, 502);
    }
    if (!upstream.ok) {
      return c.json({ error: "provider_error", status: upstream.status }, 502);
    }

    const json = (await upstream.json().catch(() => null)) as unknown;
    const models = normalizeFetchedModels(json);
    if (models.length === 0) {
      return c.json({ error: "empty_models" }, 422);
    }

    const next = provider.update({
      profileId: "custom",
      baseUrl,
      apiKey,
      remoteModels: models,
      remoteModelsProviderId: "custom",
      remoteModelsBaseUrl: baseUrl,
      remoteModelsFetchedAt: new Date().toISOString(),
      selectedModelId: models[0]?.id ?? null,
    });
    return c.json({ current: next });
  });

  // User profile — callMe / work / instructions. Gets composed into the
  // SDK's systemPrompt.append, so each turn the agent sees the user's name,
  // role and custom instructions in its system prompt.
  app.get("/settings/profile", (c) => {
    return c.json({ current: userProfile.current() });
  });

  app.post("/settings/profile", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | { callMe?: unknown; work?: unknown; instructions?: unknown }
      | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);
    const patch: Parameters<UserProfileSettingsState["update"]>[0] = {};
    if (body.callMe !== undefined) {
      if (typeof body.callMe !== "string") {
        return c.json({ error: "invalid_call_me" }, 400);
      }
      patch.callMe = body.callMe;
    }
    if (body.work !== undefined) {
      if (typeof body.work !== "string") {
        return c.json({ error: "invalid_work" }, 400);
      }
      patch.work = body.work;
    }
    if (body.instructions !== undefined) {
      if (typeof body.instructions !== "string") {
        return c.json({ error: "invalid_instructions" }, 400);
      }
      patch.instructions = body.instructions;
    }
    const next = userProfile.update(patch);
    return c.json({ current: next });
  });

  return app;
}
