import type { Database } from "bun:sqlite";
import {
  BUILT_IN_PROFILES,
  getBuiltInProfile,
  type AgentRuntime,
  type ProfileModel,
  type ProviderProfileId,
} from "../lib/providerProfiles";

// Persisted shape — JSON-encoded into settings.value under key "provider".
// `apiKey` lives here too so all provider-related state is one row. The
// existing settings.value column is TEXT NOT NULL so we always write JSON.
//
// Models are only persisted after a successful remote refresh. The cache is
// scoped by provider id and base URL so a fetched OpenAI list is never exposed
// after switching to another provider or endpoint.
export interface PersistedProvider {
  profileId: ProviderProfileId;
  baseUrl: string;
  apiKey: string;
  remoteModels: ProfileModel[];
  remoteModelsProviderId: ProviderProfileId | "";
  remoteModelsBaseUrl: string;
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
}

export interface ProviderSettingsState {
  /** Current profile-as-resolved (built-in profile inflated, custom synthesized). */
  current(): ResolvedProvider;
  /** Read the live API key. Defaults to env on first boot when no row exists. */
  getApiKey(): string;
  /** Persist a partial update — only provided fields are touched. */
  update(patch: Partial<PersistedProvider>): ResolvedProvider;
  /** Subscribe to changes — server uses this to invalidate the cached provider. */
  onChange(cb: () => void): () => void;
}

export interface ResolvedProvider {
  profileId: ProviderProfileId;
  label: string;
  baseUrl: string;
  apiKey: string;
  models: ProfileModel[];
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}

const OPENAI_TEXT_CAPABILITIES = {
  text: true,
  tools: false,
  fileCheckpoint: false,
} satisfies AgentRuntime["capabilities"];

const KEY = "provider";
const DEFAULT_PROFILE_ID: ProviderProfileId = "anthropic";

function normalizeOpenAICompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "") {
      url.pathname = "/v1";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

function resolveRuntimeBaseUrl(runtime: AgentRuntime, baseUrl: string): AgentRuntime {
  if (runtime.protocol === "unsupported") return runtime;
  if (!baseUrl.trim()) return runtime;
  if (runtime.protocol === "openai-compatible") {
    return {
      ...runtime,
      baseUrl: normalizeOpenAICompatibleBaseUrl(baseUrl),
    };
  }
  return {
    ...runtime,
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
  };
}

function isProviderProfileId(value: string): value is ProviderProfileId {
  return value === "custom" || getBuiltInProfile(value) !== undefined;
}

function sanitizeProviderProfileId(value: unknown): ProviderProfileId | null {
  if (typeof value !== "string") return null;
  if (!isProviderProfileId(value)) return null;
  return value;
}

function sanitizeRemoteModelsProviderId(
  value: unknown,
): ProviderProfileId | "" {
  if (value === "") return "";
  return sanitizeProviderProfileId(value) ?? "";
}

function sanitizeModels(value: unknown): ProfileModel[] {
  if (!Array.isArray(value)) return [];
  const out: ProfileModel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (
      typeof raw.id !== "string" ||
      typeof raw.displayName !== "string" ||
      typeof raw.description !== "string"
    ) {
      continue;
    }
    const model: ProfileModel = {
      id: raw.id,
      displayName: raw.displayName,
      description: raw.description,
    };
    out.push(model);
  }
  return out;
}

function defaultPersistedProvider(envFallback: {
  apiKey?: string;
  baseUrl?: string;
}): PersistedProvider {
  return {
    profileId: DEFAULT_PROFILE_ID,
    baseUrl: envFallback.baseUrl ?? "",
    apiKey: envFallback.apiKey ?? "",
    remoteModels: [],
    remoteModelsProviderId: "",
    remoteModelsBaseUrl: "",
    remoteModelsFetchedAt: "",
    selectedModelId: null,
  };
}

function normalizePersistedProvider(value: unknown): PersistedProvider | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const profileId = sanitizeProviderProfileId(raw.profileId);
  if (!profileId) return null;
  if (typeof raw.baseUrl !== "string" || typeof raw.apiKey !== "string") {
    return null;
  }
  return {
    profileId,
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey,
    remoteModels: sanitizeModels(raw.remoteModels),
    remoteModelsProviderId: sanitizeRemoteModelsProviderId(
      raw.remoteModelsProviderId,
    ),
    remoteModelsBaseUrl:
      typeof raw.remoteModelsBaseUrl === "string" ? raw.remoteModelsBaseUrl : "",
    remoteModelsFetchedAt:
      typeof raw.remoteModelsFetchedAt === "string"
        ? raw.remoteModelsFetchedAt
        : "",
    selectedModelId:
      typeof raw.selectedModelId === "string" ? raw.selectedModelId : null,
  };
}

function readRow(db: Database): PersistedProvider | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) return null;
  try {
    // Defensive validation. A corrupted row shouldn't crash the sidecar. Rows
    // from the old shape are hydrated with defaults for newly added fields.
    return normalizePersistedProvider(JSON.parse(row.value));
  } catch {
    return null;
  }
}

function writeRow(db: Database, value: PersistedProvider): void {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify(value));
}

function resolve(persisted: PersistedProvider): ResolvedProvider {
  if (persisted.profileId === "custom") {
    const remoteCacheMatches =
      persisted.remoteModelsProviderId === "custom" &&
      persisted.remoteModelsBaseUrl === persisted.baseUrl;
    const activeRemoteModels = remoteCacheMatches ? persisted.remoteModels : [];
    const remoteModelsFetchedAt = remoteCacheMatches
      ? persisted.remoteModelsFetchedAt
      : "";
    return {
      profileId: "custom",
      label: "Custom",
      baseUrl: persisted.baseUrl,
      apiKey: persisted.apiKey,
      models: activeRemoteModels,
      remoteModelsFetchedAt,
      selectedModelId: persisted.selectedModelId,
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: normalizeOpenAICompatibleBaseUrl(persisted.baseUrl),
        auth: "bearer",
        capabilities: OPENAI_TEXT_CAPABILITIES,
      },
      supportsRemoteModels: true,
    };
  }
  const builtIn = getBuiltInProfile(persisted.profileId);
  if (!builtIn) {
    // Profile id removed in a future release — degrade gracefully to Anthropic.
    const fallback = BUILT_IN_PROFILES[0]!;
    return {
      profileId: fallback.id,
      label: fallback.label,
      baseUrl: persisted.baseUrl || fallback.baseUrl,
      apiKey: persisted.apiKey,
      models: fallback.models,
      remoteModelsFetchedAt: "",
      selectedModelId: persisted.selectedModelId,
      agentRuntime: resolveRuntimeBaseUrl(fallback.agentRuntime, persisted.baseUrl),
      supportsRemoteModels: fallback.supportsRemoteModels,
      compatibilityNote: fallback.compatibilityNote,
    };
  }
  // For built-in profiles the baseUrl in persisted is *suggested*; user can
  // override (e.g. self-hosted Anthropic-compat gateway). Empty string falls
  // back to the profile's default.
  const baseUrl = persisted.baseUrl || builtIn.baseUrl;
  const remoteCacheMatches =
    persisted.remoteModelsProviderId === builtIn.id &&
    persisted.remoteModelsBaseUrl === baseUrl;
  const activeRemoteModels = remoteCacheMatches ? persisted.remoteModels : [];
  const remoteModelsFetchedAt = remoteCacheMatches
    ? persisted.remoteModelsFetchedAt
    : "";
  return {
    profileId: builtIn.id,
    label: builtIn.label,
    baseUrl,
    apiKey: persisted.apiKey,
    models: activeRemoteModels.length > 0 ? activeRemoteModels : builtIn.models,
    remoteModelsFetchedAt,
    selectedModelId: persisted.selectedModelId,
    agentRuntime: resolveRuntimeBaseUrl(builtIn.agentRuntime, baseUrl),
    supportsRemoteModels: builtIn.supportsRemoteModels,
    compatibilityNote: builtIn.compatibilityNote,
  };
}

function effectiveBaseUrl(
  profileId: ProviderProfileId,
  baseUrl: string,
): string {
  if (profileId === "custom") return baseUrl;
  return baseUrl || getBuiltInProfile(profileId)?.baseUrl || "";
}

function resolveNextConfig(
  cache: PersistedProvider,
  patch: Partial<PersistedProvider>,
): {
  profileId: ProviderProfileId;
  baseUrl: string;
  apiKey: string;
  profileChanged: boolean;
  configChanged: boolean;
} {
  const profileId =
    patch.profileId !== undefined
      ? sanitizeProviderProfileId(patch.profileId) ?? cache.profileId
      : cache.profileId;
  const baseUrl =
    typeof patch.baseUrl === "string" ? patch.baseUrl : cache.baseUrl;
  const apiKey =
    typeof patch.apiKey === "string" ? patch.apiKey : cache.apiKey;
  const profileChanged = profileId !== cache.profileId;

  return {
    profileId,
    baseUrl,
    apiKey,
    profileChanged,
    configChanged:
      profileChanged || baseUrl !== cache.baseUrl || apiKey !== cache.apiKey,
  };
}

function resolveNextRemoteCache(
  cache: PersistedProvider,
  patch: Partial<PersistedProvider>,
  nextConfig: ReturnType<typeof resolveNextConfig>,
): Pick<
  PersistedProvider,
  | "remoteModels"
  | "remoteModelsProviderId"
  | "remoteModelsBaseUrl"
  | "remoteModelsFetchedAt"
> {
  if (patch.remoteModels !== undefined) {
    return {
      remoteModels: sanitizeModels(patch.remoteModels),
      remoteModelsProviderId:
        patch.remoteModelsProviderId !== undefined
          ? sanitizeRemoteModelsProviderId(patch.remoteModelsProviderId)
          : cache.remoteModelsProviderId,
      remoteModelsBaseUrl:
        typeof patch.remoteModelsBaseUrl === "string"
          ? patch.remoteModelsBaseUrl
          : effectiveBaseUrl(nextConfig.profileId, nextConfig.baseUrl),
      remoteModelsFetchedAt:
        typeof patch.remoteModelsFetchedAt === "string"
          ? patch.remoteModelsFetchedAt
          : cache.remoteModelsFetchedAt,
    };
  }

  if (nextConfig.configChanged) {
    return {
      remoteModels: [],
      remoteModelsProviderId: "",
      remoteModelsBaseUrl: "",
      remoteModelsFetchedAt: "",
    };
  }

  return {
    remoteModels: cache.remoteModels,
    remoteModelsProviderId: cache.remoteModelsProviderId,
    remoteModelsBaseUrl: cache.remoteModelsBaseUrl,
    remoteModelsFetchedAt: cache.remoteModelsFetchedAt,
  };
}

function resolveNextSelectedModelId(
  cache: PersistedProvider,
  patch: Partial<PersistedProvider>,
  profileChanged: boolean,
): string | null {
  if (patch.selectedModelId === null || typeof patch.selectedModelId === "string") {
    return patch.selectedModelId;
  }
  return profileChanged ? null : cache.selectedModelId;
}

function buildNextProvider(
  cache: PersistedProvider,
  patch: Partial<PersistedProvider>,
): PersistedProvider {
  const nextConfig = resolveNextConfig(cache, patch);
  return {
    profileId: nextConfig.profileId,
    baseUrl: nextConfig.baseUrl,
    apiKey: nextConfig.apiKey,
    ...resolveNextRemoteCache(cache, patch, nextConfig),
    selectedModelId: resolveNextSelectedModelId(
      cache,
      patch,
      nextConfig.profileChanged,
    ),
  };
}

export function createProviderSettings(
  db: Database,
  envFallback: { apiKey?: string; baseUrl?: string },
): ProviderSettingsState {
  let cache: PersistedProvider =
    readRow(db) ?? defaultPersistedProvider(envFallback);

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  return {
    current(): ResolvedProvider {
      return resolve(cache);
    },
    getApiKey(): string {
      return cache.apiKey;
    },
    update(patch): ResolvedProvider {
      cache = buildNextProvider(cache, patch);
      writeRow(db, cache);
      notify();
      return resolve(cache);
    },
    onChange(cb): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
