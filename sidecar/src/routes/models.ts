import { Hono } from "hono";
import type { ProviderSettingsState } from "../services/providerSettings";
import {
  listModelsForProvider,
  type ModelFetchError,
  type ModelFetchImpl,
} from "../services/modelCatalog";
import {
  getBuiltInProfile,
  type ProfileModel,
  type ProviderProfile,
} from "../lib/providerProfiles";

interface ModelsRouteDeps {
  fetchImpl?: ModelFetchImpl;
}

const CUSTOM_OPENAI_COMPATIBLE_PROFILE: ProviderProfile = {
  id: "openai",
  label: "Custom",
  baseUrl: "",
  modelList: { strategy: "openai-compatible", path: "/models" },
  agentRuntime: {
    protocol: "openai-compatible",
    baseUrl: "",
    auth: "bearer",
    capabilities: { text: true, tools: false, fileCheckpoint: false },
  },
  supportsRemoteModels: true,
  models: [],
};

function defaultModelId(
  models: ProfileModel[],
  selectedModelId: string | null,
): string | null {
  if (selectedModelId && models.some((model) => model.id === selectedModelId)) {
    return selectedModelId;
  }
  return models[0]?.id ?? null;
}

function statusForRefreshError(error: ModelFetchError): 400 | 502 {
  return error === "missing_api_key" || error === "unsupported_remote_models"
    ? 400
    : 502;
}

// Profile-aware model list. GET returns the active cached/fallback list for
// the picker; POST /models/refresh performs the provider-specific remote
// catalog request, stores successful results, then returns the refreshed list.
export function buildModelsRoutes(
  provider: ProviderSettingsState,
  deps: ModelsRouteDeps = {},
): Hono {
  const app = new Hono();

  app.get("/models", (c) => {
    const current = provider.current();
    return c.json({
      data: current.models,
      defaultModelId: defaultModelId(
        current.models,
        current.selectedModelId,
      ),
    });
  });

  app.post("/models/refresh", async (c) => {
    const current = provider.current();
    const profile =
      current.profileId === "custom"
        ? CUSTOM_OPENAI_COMPATIBLE_PROFILE
        : getBuiltInProfile(current.profileId);

    if (!profile) {
      return c.json({ error: "unsupported_remote_models" }, 400);
    }

    const result = await listModelsForProvider({
      profile,
      baseUrl: current.baseUrl,
      apiKey: current.apiKey,
      fetchImpl: deps.fetchImpl,
    });

    if (!result.ok) {
      return c.json(
        { error: result.error },
        statusForRefreshError(result.error),
      );
    }

    const next = provider.update({
      remoteModels: result.models,
      remoteModelsProviderId: current.profileId,
      remoteModelsBaseUrl: current.baseUrl,
      remoteModelsFetchedAt: result.fetchedAt,
    });
    return c.json({
      data: next.models,
      defaultModelId: defaultModelId(next.models, next.selectedModelId),
      fetchedAt: result.fetchedAt,
    });
  });

  return app;
}
