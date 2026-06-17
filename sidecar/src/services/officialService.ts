import type { ProfileModel } from "../lib/providerProfiles";

export interface OfficialServiceSnapshot {
  websiteOrigin: string;
  models: ProfileModel[];
  fetchedAt: string;
  source: "fallback" | "remote";
}

export interface OfficialServiceState {
  setWebsiteOrigin(origin: string): OfficialServiceSnapshot;
  getWebsiteOrigin(): string;
  getModels(): ProfileModel[];
  getFetchedAt(): string;
  getSnapshot(): OfficialServiceSnapshot;
  refreshModels(): Promise<OfficialServiceSnapshot>;
}

interface OfficialServiceOptions {
  fetchImpl?: typeof fetch;
}

export const OFFICIAL_FALLBACK_MODELS: ProfileModel[] = [
  {
    id: "gpt-5.1",
    displayName: "GPT-5.1",
    description: "Official fallback model",
  },
  {
    id: "gpt-5.1-mini",
    displayName: "GPT-5.1 mini",
    description: "Official fallback model",
  },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim();
  const url = new URL(trimmed);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid_official_service_origin");
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}

function normalizeModel(value: unknown): ProfileModel | null {
  if (!isObject(value) || typeof value.id !== "string" || !value.id.trim()) {
    return null;
  }

  return {
    id: value.id,
    displayName:
      typeof value.displayName === "string" && value.displayName.trim()
        ? value.displayName
        : value.id,
    description:
      typeof value.description === "string" ? value.description : "Official model",
  };
}

function normalizeModelsResponse(payload: unknown): ProfileModel[] {
  const models =
    isObject(payload) && isObject(payload.data) && Array.isArray(payload.data.models)
      ? payload.data.models
      : [];

  return models
    .map((model) => normalizeModel(model))
    .filter((model): model is ProfileModel => model !== null);
}

export function createOfficialService(
  options: OfficialServiceOptions = {},
): OfficialServiceState {
  let websiteOrigin = "";
  let remoteModels: ProfileModel[] = [];
  let fetchedAt = "";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const snapshot = (): OfficialServiceSnapshot => {
    const hasRemoteModels = remoteModels.length > 0;
    return {
      websiteOrigin,
      models: hasRemoteModels ? remoteModels : OFFICIAL_FALLBACK_MODELS,
      fetchedAt: hasRemoteModels ? fetchedAt : "",
      source: hasRemoteModels ? "remote" : "fallback",
    };
  };

  return {
    setWebsiteOrigin(origin): OfficialServiceSnapshot {
      websiteOrigin = normalizeOrigin(origin);
      return snapshot();
    },
    getWebsiteOrigin(): string {
      return websiteOrigin;
    },
    getModels(): ProfileModel[] {
      return snapshot().models;
    },
    getFetchedAt(): string {
      return snapshot().fetchedAt;
    },
    getSnapshot(): OfficialServiceSnapshot {
      return snapshot();
    },
    async refreshModels(): Promise<OfficialServiceSnapshot> {
      if (!websiteOrigin) {
        return snapshot();
      }

      // 官方模型 catalog 只包含公开模型 id，不带用户 token 或代理密钥；
      // 失败时保留旧缓存/兜底模型，避免设置页被上游临时波动卡死。
      const response = await fetchImpl(`${websiteOrigin}/api/desktop/ai/models`);
      if (!response.ok) {
        throw new Error("official_models_refresh_failed");
      }
      const models = normalizeModelsResponse(await response.json().catch(() => null));
      if (models.length === 0) {
        throw new Error("official_models_empty");
      }

      remoteModels = models;
      fetchedAt = new Date().toISOString();
      return snapshot();
    },
  };
}
