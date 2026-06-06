import { Hono } from "hono";
import type {
  CreateProviderPresetInput,
  CreateProviderConnectionInput,
  ProviderConnectionPatch,
  ProviderModelSelection,
  ProviderPresetPatch,
  ProviderSettingsState,
} from "../services/providerSettings";
import type { UserProfileSettingsState } from "../services/userProfileSettings";
import {
  BUILT_IN_PROFILES,
  isBuiltInProfileId,
  type ProfileModel,
  type ProviderProfileId,
} from "../lib/providerProfiles";
import {
  listModelsForProvider,
  type ModelFetchError,
  type ModelFetchImpl,
} from "../services/modelCatalog";

interface SettingsRouteDeps {
  fetchImpl?: ModelFetchImpl;
}

function isValidProfileId(v: unknown): v is ProviderProfileId {
  return typeof v === "string" && (isBuiltInProfileId(v) || v === "custom");
}

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizePresetName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function providerEnvelope(provider: ProviderSettingsState) {
  const current = provider.current();
  return {
    version: provider.currentStoreVersion(),
    current,
    activePresetId: current.presetId,
    presets: provider.listPresets(),
    defaultSelection: provider.getDefaultSelection(),
    connections: provider.listConnections(),
    enabledModels: provider.listEnabledModelSelections(),
  };
}

function statusForRefreshError(error: ModelFetchError): 400 | 502 {
  return error === "missing_api_key" || error === "unsupported_remote_models"
    ? 400
    : 502;
}

function validateConnectionPatch(
  body: Record<string, unknown>,
):
  | { ok: true; patch: ProviderConnectionPatch }
  | { ok: false; error: string } {
  const patch: ProviderConnectionPatch = {};
  if (body.name !== undefined) {
    const name = sanitizePresetName(body.name);
    if (!name) return { ok: false, error: "invalid_provider_name" };
    patch.name = name;
  }
  if (body.profileId !== undefined) {
    if (!isValidProfileId(body.profileId)) {
      return { ok: false, error: "invalid_profile_id" };
    }
    patch.profileId = body.profileId;
  }
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string") {
      return { ok: false, error: "invalid_base_url" };
    }
    patch.baseUrl = body.baseUrl;
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string") {
      return { ok: false, error: "invalid_api_key" };
    }
    patch.apiKey = body.apiKey;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return { ok: false, error: "invalid_enabled" };
    }
    patch.enabled = body.enabled;
  }
  if (body.defaultModelId !== undefined) {
    if (body.defaultModelId !== null && typeof body.defaultModelId !== "string") {
      return { ok: false, error: "invalid_default_model_id" };
    }
    patch.defaultModelId = body.defaultModelId;
  }
  return { ok: true, patch };
}

function validateSelection(value: unknown): ProviderModelSelection | null {
  if (!isObjectBody(value)) return null;
  if (typeof value.providerId !== "string" || typeof value.modelId !== "string") {
    return null;
  }
  return { providerId: value.providerId, modelId: value.modelId };
}

function customOpenAIProfile(baseUrl: string) {
  return {
    id: "openai" as const,
    label: "Custom",
    baseUrl,
    modelList: { strategy: "openai-compatible" as const, path: "/models" },
    agentRuntime: {
      protocol: "openai-compatible" as const,
      baseUrl,
      auth: "bearer" as const,
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
    supportsRemoteModels: true,
    models: [],
  };
}

function validateProviderPresetPatch(
  body: Record<string, unknown>,
):
  | { ok: true; patch: ProviderPresetPatch }
  | { ok: false; error: string } {
  const patch: ProviderPresetPatch = {};
  if (body.name !== undefined) {
    const name = sanitizePresetName(body.name);
    if (!name) return { ok: false, error: "invalid_preset_name" };
    patch.name = name;
  }
  if (body.profileId !== undefined) {
    if (!isValidProfileId(body.profileId)) {
      return { ok: false, error: "invalid_profile_id" };
    }
    patch.profileId = body.profileId;
  }
  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string") {
      return { ok: false, error: "invalid_base_url" };
    }
    patch.baseUrl = body.baseUrl;
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string") {
      return { ok: false, error: "invalid_api_key" };
    }
    patch.apiKey = body.apiKey;
  }
  if (body.selectedModelId !== undefined) {
    if (
      body.selectedModelId !== null &&
      typeof body.selectedModelId !== "string"
    ) {
      return { ok: false, error: "invalid_selected_model_id" };
    }
    patch.selectedModelId = body.selectedModelId;
  }
  return { ok: true, patch };
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
  deps: SettingsRouteDeps = {},
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
      ...providerEnvelope(provider),
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

  app.post("/settings/provider/connections", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    if (!isObjectBody(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const input: CreateProviderConnectionInput = {};
    if (body.name !== undefined) {
      const name = sanitizePresetName(body.name);
      if (!name) return c.json({ error: "invalid_provider_name" }, 400);
      input.name = name;
    }
    if (body.profileId !== undefined) {
      if (!isValidProfileId(body.profileId)) {
        return c.json({ error: "invalid_profile_id" }, 400);
      }
      input.profileId = body.profileId;
    }
    if (body.baseUrl !== undefined) {
      if (typeof body.baseUrl !== "string") {
        return c.json({ error: "invalid_base_url" }, 400);
      }
      input.baseUrl = body.baseUrl;
    }
    if (body.apiKey !== undefined) {
      if (typeof body.apiKey !== "string") {
        return c.json({ error: "invalid_api_key" }, 400);
      }
      input.apiKey = body.apiKey;
    }
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "invalid_enabled" }, 400);
      }
      input.enabled = body.enabled;
    }
    const connection = provider.createConnection(input);
    return c.json({ connection, ...providerEnvelope(provider) });
  });

  app.get("/settings/provider/connections/:id", (c) => {
    const connection = provider.getConnection(c.req.param("id"));
    if (!connection) return c.json({ error: "provider_connection_not_found" }, 404);
    return c.json({ connection });
  });

  app.post("/settings/provider/connections/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isObjectBody(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const result = validateConnectionPatch(body);
    if (!result.ok) return c.json({ error: result.error }, 400);
    const connection = provider.updateConnection(c.req.param("id"), result.patch);
    if (!connection) return c.json({ error: "provider_connection_not_found" }, 404);
    return c.json({ connection, ...providerEnvelope(provider) });
  });

  app.delete("/settings/provider/connections/:id", (c) => {
    const result = provider.deleteConnection(c.req.param("id"));
    if (!result.ok) {
      return c.json(
        { error: result.error },
        result.error === "provider_connection_not_found" ? 404 : 400,
      );
    }
    return c.json(providerEnvelope(provider));
  });

  app.post("/settings/provider/connections/:id/models/refresh", async (c) => {
    const id = c.req.param("id");
    const connection = provider.getConnection(id);
    if (!connection) {
      return c.json({ error: "provider_connection_not_found" }, 404);
    }
    const profile =
      connection.profileId === "custom"
        ? customOpenAIProfile(connection.baseUrl)
        : BUILT_IN_PROFILES.find((item) => item.id === connection.profileId);
    if (!profile) {
      return c.json({ error: "unsupported_remote_models" }, 400);
    }
    const result = await listModelsForProvider({
      profile,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      fetchImpl: deps.fetchImpl,
    });
    if (!result.ok) {
      return c.json(
        { error: result.error },
        statusForRefreshError(result.error),
      );
    }
    const next = provider.updateConnection(id, {
      remoteModels: result.models,
      remoteModelsProviderId: connection.profileId,
      remoteModelsBaseUrl: connection.baseUrl,
      remoteModelsFetchedAt: result.fetchedAt,
    });
    if (!next) {
      return c.json({ error: "provider_connection_not_found" }, 404);
    }
    return c.json({
      connection: next,
      ...providerEnvelope(provider),
    });
  });

  app.post("/settings/provider/connections/:id/models/enabled", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isObjectBody(body) || !Array.isArray(body.modelIds)) {
      return c.json({ error: "invalid_enabled_model_ids" }, 400);
    }
    const modelIds = body.modelIds.filter(
      (item): item is string => typeof item === "string",
    );
    if (modelIds.length !== body.modelIds.length) {
      return c.json({ error: "invalid_enabled_model_ids" }, 400);
    }
    const defaultModelId =
      body.defaultModelId === undefined
        ? undefined
        : body.defaultModelId === null || typeof body.defaultModelId === "string"
          ? body.defaultModelId
          : "__invalid__";
    if (defaultModelId === "__invalid__") {
      return c.json({ error: "invalid_default_model_id" }, 400);
    }
    const connection = provider.setEnabledModels(
      c.req.param("id"),
      modelIds,
      defaultModelId,
    );
    if (!connection) {
      return c.json({ error: "provider_connection_not_found" }, 404);
    }
    return c.json({ connection, ...providerEnvelope(provider) });
  });

  app.post("/settings/provider/default-selection", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    const selection = validateSelection(body);
    if (!selection) return c.json({ error: "invalid_provider_selection" }, 400);
    const next = provider.setDefaultSelection(selection);
    if (!next || next.providerId !== selection.providerId || next.modelId !== selection.modelId) {
      return c.json({ error: "invalid_provider_selection" }, 400);
    }
    return c.json(providerEnvelope(provider));
  });

  app.post("/settings/provider/presets", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isObjectBody(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const input: CreateProviderPresetInput = {};
    if (body.name !== undefined) {
      const name = sanitizePresetName(body.name);
      if (!name) return c.json({ error: "invalid_preset_name" }, 400);
      input.name = name;
    }
    if (body.copyFromPresetId !== undefined) {
      if (
        typeof body.copyFromPresetId !== "string" ||
        !provider.getPreset(body.copyFromPresetId)
      ) {
        return c.json({ error: "preset_not_found" }, 404);
      }
      input.copyFromPresetId = body.copyFromPresetId;
    }
    if (body.activate !== undefined) {
      if (typeof body.activate !== "boolean") {
        return c.json({ error: "invalid_activate" }, 400);
      }
      input.activate = body.activate;
    }
    const preset = provider.createPreset(input);
    return c.json({
      preset,
      ...providerEnvelope(provider),
    });
  });

  app.get("/settings/provider/presets/:id", (c) => {
    const preset = provider.getPreset(c.req.param("id"));
    if (!preset) return c.json({ error: "preset_not_found" }, 404);
    return c.json({ preset });
  });

  app.post("/settings/provider/presets/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isObjectBody(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const result = validateProviderPresetPatch(body);
    if (!result.ok) return c.json({ error: result.error }, 400);
    const preset = provider.updatePreset(c.req.param("id"), result.patch);
    if (!preset) return c.json({ error: "preset_not_found" }, 404);
    return c.json({
      preset,
      ...providerEnvelope(provider),
    });
  });

  app.post("/settings/provider/presets/:id/activate", (c) => {
    const current = provider.activatePreset(c.req.param("id"));
    if (!current) return c.json({ error: "preset_not_found" }, 404);
    return c.json(providerEnvelope(provider));
  });

  app.delete("/settings/provider/presets/:id", (c) => {
    const result = provider.deletePreset(c.req.param("id"));
    if (!result.ok) {
      return c.json(
        { error: result.error },
        result.error === "preset_not_found" ? 404 : 400,
      );
    }
    return c.json(providerEnvelope(provider));
  });

  app.post("/settings/provider/fetch-models", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    if (!isObjectBody(body)) {
      return c.json({ error: "invalid_body" }, 400);
    }
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
    const profileId =
      body.profileId !== undefined ? body.profileId : current.profileId;
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
      profileId,
      baseUrl,
      apiKey,
      remoteModels: models,
      remoteModelsProviderId: profileId,
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
