import { Hono } from "hono";
import type { ProviderSettingsState } from "../services/providerSettings";
import type { UserProfileSettingsState } from "../services/userProfileSettings";
import { BUILT_IN_PROFILES, type ProfileModel } from "../lib/providerProfiles";

function isValidProfileId(v: unknown): v is "anthropic" | "deepseek" | "custom" {
  return v === "anthropic" || v === "deepseek" || v === "custom";
}

function sanitizeCustomModels(raw: unknown): ProfileModel[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ProfileModel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r.id !== "string" ||
      typeof r.displayName !== "string" ||
      typeof r.description !== "string"
    ) {
      continue;
    }
    out.push({
      id: r.id,
      displayName: r.displayName,
      description: r.description,
    });
  }
  return out;
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
          customModels?: unknown;
        }
      | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);

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
    if (body.customModels !== undefined) {
      const sanitized = sanitizeCustomModels(body.customModels);
      if (!sanitized) {
        return c.json({ error: "invalid_custom_models" }, 400);
      }
      patch.customModels = sanitized;
    }
    const next = provider.update(patch);
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
