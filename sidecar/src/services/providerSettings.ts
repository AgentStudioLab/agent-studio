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

export interface ProviderPreset extends PersistedProvider {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedProviderSettingsV2 {
  version: 2;
  activePresetId: string;
  presets: ProviderPreset[];
}

export interface ProviderModelSelection {
  providerId: string;
  modelId: string;
}

export interface ProviderConnection extends PersistedProvider {
  id: string;
  name: string;
  enabled: boolean;
  enabledModelIds: string[];
  defaultModelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedProviderSettingsV3 {
  version: 3;
  defaultSelection: ProviderModelSelection | null;
  connections: ProviderConnection[];
}

export interface ProviderConnectionSummary {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  providerLabel: string;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  modelCount: number;
  enabledModelCount: number;
  defaultModelId: string | null;
  remoteModelsFetchedAt: string;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}

export interface ProviderPresetSummary {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  providerLabel: string;
  baseUrl: string;
  selectedModelId: string | null;
  selectedModelLabel: string | null;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  remoteModelsFetchedAt: string;
  compatibilityNote?: string;
}

export interface EnabledModelOption {
  providerId: string;
  providerName: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  modelDescription: string;
  agentRuntime: AgentRuntime;
  compatibilityNote?: string;
}

export type ProviderPresetPatch = Partial<
  Pick<
    ProviderPreset,
    "name" | "profileId" | "baseUrl" | "apiKey" | "selectedModelId"
  >
>;

export interface CreateProviderPresetInput {
  name?: string;
  copyFromPresetId?: string;
  activate?: boolean;
}

export type ProviderConnectionPatch = Partial<
  Pick<
    ProviderConnection,
    | "name"
    | "profileId"
    | "baseUrl"
    | "apiKey"
    | "remoteModels"
    | "remoteModelsProviderId"
    | "remoteModelsBaseUrl"
    | "remoteModelsFetchedAt"
    | "enabled"
    | "defaultModelId"
  >
>;

export interface CreateProviderConnectionInput {
  name?: string;
  profileId?: ProviderProfileId;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface ResolvedProviderConnection extends ResolvedProvider {
  providerId: string;
  providerName: string;
  enabled: boolean;
  enabledModelIds: string[];
  defaultModelId: string | null;
}

export interface ResolvedProviderForRun extends ResolvedProvider {
  providerId: string;
  providerName: string;
  modelId: string | null;
}

export interface ProviderSettingsState {
  /** Provider settings store version. */
  currentStoreVersion(): 3;
  /** Global default provider/model selection. */
  getDefaultSelection(): ProviderModelSelection | null;
  /** List provider connections for the v3 settings UI. */
  listConnections(): ProviderConnectionSummary[];
  /** Read one provider connection as resolved config. */
  getConnection(id: string): ResolvedProviderConnection | null;
  /** Create one provider connection. */
  createConnection(input?: CreateProviderConnectionInput): ResolvedProviderConnection;
  /** Update one provider connection. */
  updateConnection(id: string, patch: ProviderConnectionPatch): ResolvedProviderConnection | null;
  /** Delete one provider connection while keeping at least one. */
  deleteConnection(
    id: string,
  ):
    | { ok: true }
    | { ok: false; error: "provider_connection_not_found" | "cannot_delete_last_connection" };
  /** Set enabled models for a provider connection. */
  setEnabledModels(
    id: string,
    modelIds: string[],
    defaultModelId?: string | null,
  ): ResolvedProviderConnection | null;
  /** Set the global default provider/model selection. */
  setDefaultSelection(selection: ProviderModelSelection | null): ProviderModelSelection | null;
  /** List all enabled provider/model options for chat pickers. */
  listEnabledModelSelections(): EnabledModelOption[];
  /** Resolve a provider/model selection for one run. */
  resolveSelection(selection?: ProviderModelSelection | null): ResolvedProviderForRun;
  /** Current profile-as-resolved (built-in profile inflated, custom synthesized). */
  current(): ResolvedProvider;
  /** Read the live API key. Defaults to env on first boot when no row exists. */
  getApiKey(): string;
  /** Resolve a preset by id, or null when it no longer exists. */
  getPreset(id: string): ResolvedProvider | null;
  /** List all provider presets with resolved provider metadata. */
  listPresets(): ProviderPresetSummary[];
  /** Create a new preset by cloning an existing preset or the active preset. */
  createPreset(input?: CreateProviderPresetInput): ResolvedProvider;
  /** Update a preset by id. Notifies only when updating the active preset. */
  updatePreset(id: string, patch: ProviderPresetPatch): ResolvedProvider | null;
  /** Make a preset active. Notifies only when the active preset changes. */
  activatePreset(id: string): ResolvedProvider | null;
  /** Delete a preset while preserving at least one preset. */
  deletePreset(
    id: string,
  ):
    | { ok: true }
    | { ok: false; error: "preset_not_found" | "cannot_delete_last_preset" };
  /** Persist a partial update — only provided fields are touched. */
  update(patch: Partial<PersistedProvider>): ResolvedProvider;
  /** Subscribe to changes — server uses this to invalidate the cached provider. */
  onChange(cb: () => void): () => void;
}

export interface ResolvedProvider {
  presetId: string;
  presetName: string;
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

function nowIso(): string {
  return new Date().toISOString();
}

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

function defaultPresetName(profileId: ProviderProfileId): string {
  if (profileId === "custom") return "Custom";
  return getBuiltInProfile(profileId)?.label ?? "Anthropic";
}

function sanitizePresetName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function makePreset(
  provider: PersistedProvider,
  options: {
    id?: string;
    name?: string;
    createdAt?: string;
    updatedAt?: string;
  } = {},
): ProviderPreset {
  const createdAt = options.createdAt ?? nowIso();
  return {
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? defaultPresetName(provider.profileId),
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
    ...provider,
  };
}

function makeConnection(
  provider: PersistedProvider,
  options: {
    id?: string;
    name?: string;
    enabled?: boolean;
    enabledModelIds?: string[];
    defaultModelId?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } = {},
): ProviderConnection {
  const createdAt = options.createdAt ?? nowIso();
  const enabledModelIds = [...new Set(options.enabledModelIds ?? [])];
  const defaultModelId =
    options.defaultModelId !== undefined
      ? options.defaultModelId
      : (enabledModelIds[0] ?? provider.selectedModelId ?? null);
  return {
    id: options.id ?? crypto.randomUUID(),
    name: options.name ?? defaultPresetName(provider.profileId),
    enabled: options.enabled ?? true,
    enabledModelIds,
    defaultModelId,
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
    ...provider,
  };
}

function connectionToPreset(connection: ProviderConnection): ProviderPreset {
  return {
    id: connection.id,
    name: connection.name,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    ...toPersistedProvider(connection),
  };
}

function presetToConnection(preset: ProviderPreset): ProviderConnection {
  return makeConnection(toPersistedProvider(preset), {
    id: preset.id,
    name: preset.name,
    enabled: true,
    enabledModelIds: preset.selectedModelId ? [preset.selectedModelId] : [],
    defaultModelId: preset.selectedModelId,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
  });
}

function defaultStore(envFallback: {
  apiKey?: string;
  baseUrl?: string;
}): PersistedProviderSettingsV3 {
  const connection = makeConnection(defaultPersistedProvider(envFallback));
  const repaired = repairStore({
    version: 3,
    defaultSelection: null,
    connections: [connection],
  });
  return {
    ...repaired,
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

function normalizeProviderPreset(value: unknown): ProviderPreset | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    raw.id.trim() === "" ||
    typeof raw.name !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string"
  ) {
    return null;
  }
  const provider = normalizePersistedProvider(raw);
  if (!provider) return null;
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...provider,
  };
}

function normalizeV2Store(value: unknown): PersistedProviderSettingsV2 | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2 || typeof raw.activePresetId !== "string") return null;
  if (!Array.isArray(raw.presets)) return null;
  const presets = raw.presets
    .map((preset) => normalizeProviderPreset(preset))
    .filter((preset): preset is ProviderPreset => preset !== null);
  if (presets.length === 0) return null;
  const activePresetId = presets.some(
    (preset) => preset.id === raw.activePresetId,
  )
    ? raw.activePresetId
    : presets[0]!.id;
  return {
    version: 2,
    activePresetId,
    presets,
  };
}

function normalizeSelection(value: unknown): ProviderModelSelection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.providerId !== "string" || typeof raw.modelId !== "string") {
    return null;
  }
  return { providerId: raw.providerId, modelId: raw.modelId };
}

function normalizeConnection(value: unknown): ProviderConnection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    raw.id.trim() === "" ||
    typeof raw.name !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string"
  ) {
    return null;
  }
  const provider = normalizePersistedProvider(raw);
  if (!provider) return null;
  const enabledModelIds = Array.isArray(raw.enabledModelIds)
    ? raw.enabledModelIds.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: raw.id,
    name: sanitizePresetName(raw.name) ?? defaultPresetName(provider.profileId),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    enabledModelIds: [...new Set(enabledModelIds)],
    defaultModelId:
      typeof raw.defaultModelId === "string" ? raw.defaultModelId : null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...provider,
  };
}

function normalizeV3Store(value: unknown): PersistedProviderSettingsV3 | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 3 || !Array.isArray(raw.connections)) return null;
  const connections = raw.connections
    .map((connection) => normalizeConnection(connection))
    .filter((connection): connection is ProviderConnection => connection !== null);
  if (connections.length === 0) return null;
  return repairStore({
    version: 3,
    defaultSelection: normalizeSelection(raw.defaultSelection),
    connections,
  });
}

function v2ToV3(value: PersistedProviderSettingsV2): PersistedProviderSettingsV3 {
  const connections = value.presets.map((preset) => presetToConnection(preset));
  const active = value.presets.find((preset) => preset.id === value.activePresetId);
  const defaultSelection =
    active?.selectedModelId
      ? { providerId: active.id, modelId: active.selectedModelId }
      : null;
  return repairStore({
    version: 3,
    defaultSelection,
    connections,
  });
}

function legacyToV3(value: PersistedProvider): PersistedProviderSettingsV3 {
  const connection = makeConnection(value, {
    enabledModelIds: value.selectedModelId ? [value.selectedModelId] : [],
    defaultModelId: value.selectedModelId,
  });
  return repairStore({
    version: 3,
    defaultSelection: value.selectedModelId
      ? { providerId: connection.id, modelId: value.selectedModelId }
      : null,
    connections: [connection],
  });
}

function readRow(
  db: Database,
  envFallback: { apiKey?: string; baseUrl?: string },
): PersistedProviderSettingsV3 {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined;
  if (!row) return defaultStore(envFallback);
  try {
    // Defensive validation. A corrupted row shouldn't crash the sidecar. Rows
    // from the old shape are hydrated with defaults for newly added fields.
    const parsed = JSON.parse(row.value);
    const v3 = normalizeV3Store(parsed);
    if (v3) return v3;
    const v2 = normalizeV2Store(parsed);
    if (v2) return v2ToV3(v2);
    const legacy = normalizePersistedProvider(parsed);
    if (legacy) return legacyToV3(legacy);
  } catch {
    // Fall through to default store.
  }
  return defaultStore(envFallback);
}

function readOrInitializeStore(
  db: Database,
  envFallback: { apiKey?: string; baseUrl?: string },
): PersistedProviderSettingsV3 {
  const store = readRow(db, envFallback);
  writeRow(db, store);
  return store;
}

function compatibilityActivePresetId(value: PersistedProviderSettingsV3): string {
  return value.defaultSelection?.providerId ?? value.connections[0]!.id;
}

function writeRow(db: Database, value: PersistedProviderSettingsV3): void {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(
    KEY,
    JSON.stringify({
      ...value,
      activePresetId: compatibilityActivePresetId(value),
    }),
  );
}

function resolve(persisted: ProviderPreset): ResolvedProvider {
  if (persisted.profileId === "custom") {
    const remoteCacheMatches =
      persisted.remoteModelsProviderId === "custom" &&
      persisted.remoteModelsBaseUrl === persisted.baseUrl;
    const activeRemoteModels = remoteCacheMatches ? persisted.remoteModels : [];
    const remoteModelsFetchedAt = remoteCacheMatches
      ? persisted.remoteModelsFetchedAt
      : "";
    return {
      presetId: persisted.id,
      presetName: persisted.name,
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
      presetId: persisted.id,
      presetName: persisted.name,
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
    presetId: persisted.id,
    presetName: persisted.name,
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

function resolveConnection(connection: ProviderConnection): ResolvedProviderConnection {
  const resolved = resolve(connectionToPreset(connection));
  return {
    ...resolved,
    providerId: connection.id,
    providerName: connection.name,
    enabled: connection.enabled,
    enabledModelIds: connection.enabledModelIds,
    defaultModelId: connection.defaultModelId,
  };
}

function availableModelIds(connection: ProviderConnection): Set<string> {
  return new Set(resolveConnection(connection).models.map((model) => model.id));
}

function repairConnection(connection: ProviderConnection): ProviderConnection {
  const modelIds = availableModelIds(connection);
  const filteredEnabledModelIds = connection.enabledModelIds.filter((id) =>
    modelIds.has(id),
  );
  const enabledModelIds =
    connection.enabled && filteredEnabledModelIds.length === 0
      ? [...modelIds].slice(0, 1)
      : filteredEnabledModelIds;
  const defaultModelId =
    connection.defaultModelId && enabledModelIds.includes(connection.defaultModelId)
      ? connection.defaultModelId
      : (enabledModelIds[0] ?? null);
  return {
    ...connection,
    enabledModelIds,
    defaultModelId,
  };
}

function defaultSelectionForStore(
  store: PersistedProviderSettingsV3,
): ProviderModelSelection | null {
  for (const connection of store.connections) {
    if (!connection.enabled) continue;
    const modelId = connection.defaultModelId ?? connection.enabledModelIds[0] ?? null;
    if (modelId) return { providerId: connection.id, modelId };
  }
  return null;
}

function isValidSelection(
  store: PersistedProviderSettingsV3,
  selection: ProviderModelSelection | null,
): selection is ProviderModelSelection {
  if (!selection) return false;
  const connection = store.connections.find(
    (item) => item.id === selection.providerId,
  );
  return Boolean(
    connection?.enabled && connection.enabledModelIds.includes(selection.modelId),
  );
}

function repairStore(store: PersistedProviderSettingsV3): PersistedProviderSettingsV3 {
  const connections = store.connections
    .filter((connection) => connection.id.trim() !== "")
    .map((connection) => repairConnection(connection));
  const nextConnections =
    connections.length > 0
      ? connections
      : [makeConnection(defaultPersistedProvider({}))];
  const candidate = {
    version: 3 as const,
    defaultSelection: store.defaultSelection,
    connections: nextConnections,
  };
  return {
    ...candidate,
    defaultSelection: isValidSelection(candidate, candidate.defaultSelection)
      ? candidate.defaultSelection
      : defaultSelectionForStore(candidate),
  };
}

function activeConnection(cache: PersistedProviderSettingsV3): ProviderConnection {
  return (
    (cache.defaultSelection
      ? cache.connections.find(
          (connection) => connection.id === cache.defaultSelection?.providerId,
        )
      : undefined) ?? cache.connections[0]!
  );
}

function activeConnectionOrNull(
  cache: PersistedProviderSettingsV3,
): ProviderConnection | null {
  return (
    (cache.defaultSelection
      ? cache.connections.find(
          (connection) => connection.id === cache.defaultSelection?.providerId,
        )
      : undefined) ??
    cache.connections[0] ??
    null
  );
}

function activePreset(cache: PersistedProviderSettingsV3): ProviderPreset {
  return connectionToPreset(activeConnection(cache));
}

function activePresetOrNull(cache: PersistedProviderSettingsV3): ProviderPreset | null {
  const connection = activeConnectionOrNull(cache);
  return connection ? connectionToPreset(connection) : null;
}

function toPersistedProvider(preset: ProviderPreset): PersistedProvider {
  return {
    profileId: preset.profileId,
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    remoteModels: preset.remoteModels,
    remoteModelsProviderId: preset.remoteModelsProviderId,
    remoteModelsBaseUrl: preset.remoteModelsBaseUrl,
    remoteModelsFetchedAt: preset.remoteModelsFetchedAt,
    selectedModelId: preset.selectedModelId,
  };
}

function selectedModelLabel(resolved: ResolvedProvider): string | null {
  if (resolved.selectedModelId) {
    const selected = resolved.models.find(
      (model) => model.id === resolved.selectedModelId,
    );
    return selected?.displayName ?? resolved.selectedModelId;
  }
  const selected = resolved.models[0];
  return selected?.displayName ?? null;
}

function summarizePreset(preset: ProviderPreset): ProviderPresetSummary {
  const resolved = resolve(preset);
  return {
    id: preset.id,
    name: preset.name,
    profileId: resolved.profileId,
    providerLabel: resolved.label,
    baseUrl: resolved.baseUrl,
    selectedModelId: resolved.selectedModelId,
    selectedModelLabel: selectedModelLabel(resolved),
    agentRuntime: resolved.agentRuntime,
    supportsRemoteModels: resolved.supportsRemoteModels,
    remoteModelsFetchedAt: resolved.remoteModelsFetchedAt,
    compatibilityNote: resolved.compatibilityNote,
  };
}

function summarizeConnection(
  connection: ProviderConnection,
): ProviderConnectionSummary {
  const resolved = resolveConnection(connection);
  return {
    id: connection.id,
    name: connection.name,
    profileId: resolved.profileId,
    providerLabel: resolved.label,
    baseUrl: resolved.baseUrl,
    enabled: connection.enabled,
    hasApiKey: connection.apiKey.trim().length > 0,
    modelCount: resolved.models.length,
    enabledModelCount: connection.enabledModelIds.length,
    defaultModelId: connection.defaultModelId,
    remoteModelsFetchedAt: resolved.remoteModelsFetchedAt,
    agentRuntime: resolved.agentRuntime,
    supportsRemoteModels: resolved.supportsRemoteModels,
    compatibilityNote: resolved.compatibilityNote,
  };
}

function enabledModelOptions(
  cache: PersistedProviderSettingsV3,
): EnabledModelOption[] {
  const options: EnabledModelOption[] = [];
  for (const connection of cache.connections) {
    if (!connection.enabled) continue;
    const resolved = resolveConnection(connection);
    for (const modelId of connection.enabledModelIds) {
      const model = resolved.models.find((item) => item.id === modelId);
      if (!model) continue;
      options.push({
        providerId: connection.id,
        providerName: connection.name,
        providerLabel: resolved.label,
        modelId,
        modelLabel: model.displayName,
        modelDescription: model.description,
        agentRuntime: resolved.agentRuntime,
        compatibilityNote: resolved.compatibilityNote,
      });
    }
  }
  return options;
}

function resolveSelectionForRun(
  cache: PersistedProviderSettingsV3,
  selection?: ProviderModelSelection | null,
): ResolvedProviderForRun {
  const effectiveSelection =
    selection && isValidSelection(cache, selection)
      ? selection
      : cache.defaultSelection && isValidSelection(cache, cache.defaultSelection)
        ? cache.defaultSelection
        : defaultSelectionForStore(cache);
  const connection =
    effectiveSelection
      ? cache.connections.find((item) => item.id === effectiveSelection.providerId)
      : activeConnection(cache);
  const resolved = resolveConnection(connection ?? activeConnection(cache));
  const modelId =
    effectiveSelection?.modelId ??
    resolved.defaultModelId ??
    resolved.enabledModelIds[0] ??
    resolved.selectedModelId ??
    resolved.models[0]?.id ??
    null;
  return {
    ...resolved,
    modelId,
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

function buildNextPreset(
  cache: ProviderPreset,
  patch: Partial<PersistedProvider>,
): ProviderPreset {
  return {
    ...cache,
    ...buildNextProvider(toPersistedProvider(cache), patch),
    updatedAt: nowIso(),
  };
}

function buildUpdatedPreset(
  cache: ProviderPreset,
  patch: ProviderPresetPatch,
): ProviderPreset {
  const { name: rawName, ...providerPatch } = patch;
  const name =
    rawName === undefined ? cache.name : sanitizePresetName(rawName) ?? cache.name;
  return {
    ...buildNextPreset(cache, providerPatch),
    name,
  };
}

function clonePreset(
  source: ProviderPreset,
  input: CreateProviderPresetInput | undefined,
): ProviderPreset {
  const createdAt = nowIso();
  return {
    ...source,
    id: crypto.randomUUID(),
    name:
      sanitizePresetName(input?.name) ??
      `${sanitizePresetName(source.name) ?? defaultPresetName(source.profileId)} Copy`,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createProviderSettings(
  db: Database,
  envFallback: { apiKey?: string; baseUrl?: string },
): ProviderSettingsState {
  let cache: PersistedProviderSettingsV3 = readOrInitializeStore(db, envFallback);

  const listeners = new Set<() => void>();
  const notify = () => {
    for (const fn of listeners) fn();
  };

  return {
    currentStoreVersion(): 3 {
      return 3;
    },
    getDefaultSelection(): ProviderModelSelection | null {
      return cache.defaultSelection;
    },
    listConnections(): ProviderConnectionSummary[] {
      return cache.connections.map((connection) =>
        summarizeConnection(connection),
      );
    },
    getConnection(id): ResolvedProviderConnection | null {
      const connection = cache.connections.find((item) => item.id === id);
      return connection ? resolveConnection(connection) : null;
    },
    createConnection(input): ResolvedProviderConnection {
      const provider = defaultPersistedProvider({});
      const profileId = input?.profileId ?? provider.profileId;
      const connection = makeConnection(
        {
          ...provider,
          profileId,
          baseUrl: input?.baseUrl ?? getBuiltInProfile(profileId)?.baseUrl ?? "",
          apiKey: input?.apiKey ?? "",
        },
        {
          name: sanitizePresetName(input?.name) ?? defaultPresetName(profileId),
          enabled: input?.enabled ?? true,
        },
      );
      cache = repairStore({
        version: 3,
        defaultSelection: cache.defaultSelection,
        connections: [...cache.connections, connection],
      });
      writeRow(db, cache);
      notify();
      return resolveConnection(connection);
    },
    updateConnection(id, patch): ResolvedProviderConnection | null {
      const connection = cache.connections.find((item) => item.id === id);
      if (!connection) return null;
      const { name, enabled, defaultModelId, ...providerPatch } = patch;
      const nextProvider = buildNextProvider(
        toPersistedProvider(connection),
        providerPatch,
      );
      const nextConnection = repairConnection({
        ...connection,
        ...nextProvider,
        name:
          name === undefined
            ? connection.name
            : sanitizePresetName(name) ?? connection.name,
        enabled: enabled ?? connection.enabled,
        defaultModelId:
          defaultModelId === undefined ? connection.defaultModelId : defaultModelId,
        updatedAt: nowIso(),
      });
      cache = repairStore({
        version: 3,
        defaultSelection: cache.defaultSelection,
        connections: cache.connections.map((item) =>
          item.id === id ? nextConnection : item,
        ),
      });
      writeRow(db, cache);
      notify();
      return resolveConnection(nextConnection);
    },
    deleteConnection(id):
      | { ok: true }
      | {
          ok: false;
          error:
            | "provider_connection_not_found"
            | "cannot_delete_last_connection";
        } {
      if (!cache.connections.some((item) => item.id === id)) {
        return { ok: false, error: "provider_connection_not_found" };
      }
      if (cache.connections.length === 1) {
        return { ok: false, error: "cannot_delete_last_connection" };
      }
      cache = repairStore({
        version: 3,
        defaultSelection:
          cache.defaultSelection?.providerId === id ? null : cache.defaultSelection,
        connections: cache.connections.filter((item) => item.id !== id),
      });
      writeRow(db, cache);
      notify();
      return { ok: true };
    },
    setEnabledModels(
      id,
      modelIds,
      defaultModelId,
    ): ResolvedProviderConnection | null {
      const connection = cache.connections.find((item) => item.id === id);
      if (!connection) return null;
      const allowed = availableModelIds(connection);
      const enabledModelIds = [...new Set(modelIds)].filter((modelId) =>
        allowed.has(modelId),
      );
      const nextConnection = repairConnection({
        ...connection,
        enabledModelIds,
        defaultModelId:
          defaultModelId === undefined
            ? connection.defaultModelId
            : defaultModelId,
        selectedModelId:
          defaultModelId === undefined
            ? connection.selectedModelId
            : defaultModelId,
        updatedAt: nowIso(),
      });
      cache = repairStore({
        version: 3,
        defaultSelection: cache.defaultSelection,
        connections: cache.connections.map((item) =>
          item.id === id ? nextConnection : item,
        ),
      });
      writeRow(db, cache);
      notify();
      return resolveConnection(nextConnection);
    },
    setDefaultSelection(selection): ProviderModelSelection | null {
      cache = repairStore({
        version: 3,
        defaultSelection: selection,
        connections: cache.connections,
      });
      writeRow(db, cache);
      notify();
      return cache.defaultSelection;
    },
    listEnabledModelSelections(): EnabledModelOption[] {
      return enabledModelOptions(cache);
    },
    resolveSelection(selection): ResolvedProviderForRun {
      return resolveSelectionForRun(cache, selection);
    },
    current(): ResolvedProvider {
      return resolveSelectionForRun(cache);
    },
    getApiKey(): string {
      return activeConnection(cache).apiKey;
    },
    getPreset(id): ResolvedProvider | null {
      const connection = cache.connections.find((item) => item.id === id);
      return connection ? resolve(connectionToPreset(connection)) : null;
    },
    listPresets(): ProviderPresetSummary[] {
      return cache.connections.map((connection) =>
        summarizePreset(connectionToPreset(connection)),
      );
    },
    createPreset(input): ResolvedProvider {
      const source =
        (input?.copyFromPresetId
          ? cache.connections.find(
              (connection) => connection.id === input.copyFromPresetId,
            )
          : undefined) ??
        activeConnectionOrNull(cache) ??
        makeConnection(defaultPersistedProvider({}));
      const nextPreset = clonePreset(connectionToPreset(source), input);
      const nextConnection = presetToConnection(nextPreset);
      const activatedConnection = repairConnection(nextConnection);
      const activatedModelId =
        activatedConnection.defaultModelId ??
        activatedConnection.enabledModelIds[0] ??
        null;
      cache = repairStore({
        version: 3,
        defaultSelection:
          input?.activate === true
            ? activatedModelId
              ? { providerId: activatedConnection.id, modelId: activatedModelId }
              : null
            : cache.defaultSelection,
        connections: [
          ...cache.connections,
          input?.activate === true ? activatedConnection : nextConnection,
        ],
      });
      writeRow(db, cache);
      if (input?.activate === true) {
        notify();
      }
      return resolve(nextPreset);
    },
    updatePreset(id, patch): ResolvedProvider | null {
      const connection = cache.connections.find((item) => item.id === id);
      if (!connection) return null;
      const nextPreset = buildUpdatedPreset(connectionToPreset(connection), patch);
      const nextConnection = {
        ...presetToConnection(nextPreset),
        enabled: connection.enabled,
        enabledModelIds: connection.enabledModelIds,
        defaultModelId: nextPreset.selectedModelId ?? connection.defaultModelId,
      };
      cache = repairStore({
        version: 3,
        defaultSelection: cache.defaultSelection,
        connections: cache.connections.map((item) =>
          item.id === id ? nextConnection : item,
        ),
      });
      writeRow(db, cache);
      if (activeConnection(cache).id === id) {
        notify();
      }
      return resolve(nextPreset);
    },
    activatePreset(id): ResolvedProvider | null {
      const connection = cache.connections.find((item) => item.id === id);
      if (!connection) return null;
      const previousActiveId = activeConnection(cache).id;
      const modelId =
        connection.defaultModelId ??
        connection.enabledModelIds[0] ??
        resolveConnection(connection).models[0]?.id ??
        null;
      const nextConnection =
        modelId && !connection.enabledModelIds.includes(modelId)
          ? {
              ...connection,
              enabledModelIds: [modelId],
              defaultModelId: modelId,
              selectedModelId: modelId,
            }
          : connection;
      cache = repairStore({
        version: 3,
        defaultSelection: modelId ? { providerId: id, modelId } : null,
        connections: cache.connections.map((item) =>
          item.id === id ? nextConnection : item,
        ),
      });
      writeRow(db, cache);
      if (previousActiveId !== id) {
        notify();
      }
      return resolve(connectionToPreset(nextConnection));
    },
    deletePreset(id):
      | { ok: true }
      | {
          ok: false;
          error: "preset_not_found" | "cannot_delete_last_preset";
        } {
      const connection = cache.connections.find((item) => item.id === id);
      if (!connection) {
        return { ok: false, error: "preset_not_found" };
      }
      if (cache.connections.length === 1) {
        return { ok: false, error: "cannot_delete_last_preset" };
      }
      const previousActiveId = activeConnection(cache).id;
      cache = repairStore({
        version: 3,
        defaultSelection:
          previousActiveId === id ? null : cache.defaultSelection,
        connections: cache.connections.filter((item) => item.id !== id),
      });
      writeRow(db, cache);
      if (previousActiveId === id) {
        notify();
      }
      return { ok: true };
    },
    update(patch): ResolvedProvider {
      const current = activeConnection(cache);
      const nextPreset = buildNextPreset(connectionToPreset(current), patch);
      const nextConnection = {
        ...presetToConnection(nextPreset),
        enabled: current.enabled,
        enabledModelIds:
          nextPreset.selectedModelId &&
          !current.enabledModelIds.includes(nextPreset.selectedModelId)
            ? [...current.enabledModelIds, nextPreset.selectedModelId]
            : current.enabledModelIds,
        defaultModelId: nextPreset.selectedModelId ?? current.defaultModelId,
      };
      cache = repairStore({
        version: 3,
        defaultSelection: nextConnection.defaultModelId
          ? { providerId: nextConnection.id, modelId: nextConnection.defaultModelId }
          : cache.defaultSelection,
        connections: cache.connections.map((connection) =>
          connection.id === current.id ? nextConnection : connection,
        ),
      });
      writeRow(db, cache);
      notify();
      return resolve(nextPreset);
    },
    onChange(cb): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}
