import type { ProfileModel, ProviderProfile } from "../lib/providerProfiles";

export type ModelFetchError =
  | "missing_api_key"
  | "unsupported_remote_models"
  | "invalid_provider_response"
  | "remote_models_failed";

export type ModelFetchResult =
  | { ok: true; models: ProfileModel[]; fetchedAt: string }
  | { ok: false; error: ModelFetchError };

export type ModelFetchInit = { headers?: Record<string, string> };
export type ModelFetchImpl = (
  url: string,
  init?: ModelFetchInit,
) => Promise<Response>;

export interface ListModelsInput {
  profile: ProviderProfile;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: ModelFetchImpl;
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmedBase = baseUrl.trim().replace(/\/+$/, "");
  const normalizedPath = path.trim().startsWith("/")
    ? path.trim()
    : `/${path.trim()}`;
  return `${trimmedBase}${normalizedPath}`;
}

function openAICompatibleBaseUrl(
  baseUrl: string,
  options: { preserveBaseUrl?: boolean } = {},
): string {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "" && !options.preserveBaseUrl) {
      url.pathname = "/v1";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

function remoteModel(id: unknown): ProfileModel | null {
  if (typeof id !== "string") return null;
  const trimmedId = id.trim();
  if (!trimmedId) return null;
  return {
    id: trimmedId,
    displayName: trimmedId,
    description: "Remote model",
  };
}

function normalizeOpenAICompatible(value: unknown): ProfileModel[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) =>
      item && typeof item === "object"
        ? remoteModel((item as { id?: unknown }).id)
        : null,
    )
    .filter((model): model is ProfileModel => model !== null);
}

function normalizeAnthropic(value: unknown): ProfileModel[] {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as { id?: unknown; display_name?: unknown };
      const model = remoteModel(record.id);
      if (!model) return null;
      return {
        ...model,
        displayName:
          typeof record.display_name === "string" &&
          record.display_name.trim()
            ? record.display_name.trim()
            : model.displayName,
      };
    })
    .filter((model): model is ProfileModel => model !== null);
}

function normalizeGemini(value: unknown): ProfileModel[] {
  if (!value || typeof value !== "object") return [];
  const models = (value as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  return models
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = (item as { name?: unknown }).name;
      return remoteModel(
        typeof name === "string" ? name.replace(/^models\//, "") : name,
      );
    })
    .filter((model): model is ProfileModel => model !== null);
}

async function fetchJson(
  fetchImpl: ModelFetchImpl,
  url: string,
  init?: ModelFetchInit,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; error: "invalid_provider_response" | "remote_models_failed" }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, error: "remote_models_failed" };
  }

  if (!response.ok) {
    return { ok: false, error: "remote_models_failed" };
  }

  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false, error: "invalid_provider_response" };
  }
}

function success(models: ProfileModel[]): ModelFetchResult {
  if (models.length === 0) {
    return { ok: false, error: "invalid_provider_response" };
  }
  return { ok: true, models, fetchedAt: new Date().toISOString() };
}

export async function listModelsForProvider(
  input: ListModelsInput,
): Promise<ModelFetchResult> {
  const strategy = input.profile.modelList.strategy;
  if (strategy === "static" || strategy === "bedrock") {
    return { ok: false, error: "unsupported_remote_models" };
  }

  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return { ok: false, error: "missing_api_key" };
  }

  const fetchImpl: ModelFetchImpl =
    input.fetchImpl ?? ((url, init) => fetch(url, init));
  if (strategy === "gemini") {
    const response = await fetchJson(
      fetchImpl,
      `${joinUrl(input.baseUrl, "/models")}?key=${encodeURIComponent(apiKey)}`,
    );
    if (!response.ok) return response;
    return success(normalizeGemini(response.value));
  }

  if (strategy === "anthropic") {
    const catalogBaseUrl = input.profile.modelList.baseUrl ?? input.baseUrl;
    const response = await fetchJson(
      fetchImpl,
      joinUrl(
        catalogBaseUrl,
        input.profile.modelList.path?.trim() || "/v1/models",
      ),
      {
        headers: {
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
      },
    );
    if (!response.ok) return response;
    return success(normalizeAnthropic(response.value));
  }

  const catalogBaseUrl = input.profile.modelList.baseUrl ?? input.baseUrl;
  const response = await fetchJson(
    fetchImpl,
    joinUrl(
      openAICompatibleBaseUrl(catalogBaseUrl, {
        preserveBaseUrl: input.profile.modelList.preserveBaseUrl,
      }),
      input.profile.modelList.path?.trim() || "/models",
    ),
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) return response;
  return success(normalizeOpenAICompatible(response.value));
}
