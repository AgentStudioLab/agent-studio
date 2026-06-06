import { invoke } from "@tauri-apps/api/core";
import { fetchSidecar } from "../sidecar-client";

const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

/**
 * 更新 API key：Tauri 模式下先写 plugin-store (持久化)，再通知 sidecar 热更新内存。
 * 浏览器模式（pnpm dev + pnpm dev:server）跳过 plugin-store，只热更 sidecar；
 * 持久化由 .env 负责。
 */
export async function setApiKey(key: string): Promise<void> {
  if (isTauri) {
    await invoke("set_api_key", { key });
  }
  const res = await fetchSidecar("/settings/api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key.length > 0 ? key : null }),
  });
  if (!res.ok) throw new Error(`api_key_sidecar_${res.status}`);
}

export type ProfileId =
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "openai"
  | "minimax"
  | "openrouter"
  | "novita"
  | "bedrock"
  | "dashscope"
  | "siliconflow-cn"
  | "siliconflow"
  | "zhipu"
  | "moonshot-cn"
  | "moonshot-global"
  | "doubao"
  | "volcengine-ark"
  | "bailian"
  | "qianfan"
  | "hunyuan"
  | "custom";

export type CustomProviderProtocol = "openai-compatible" | "anthropic";

export interface ProfileModel {
  id: string;
  displayName: string;
  description: string;
}

export interface AgentRuntimeCapabilities {
  text: boolean;
  tools: boolean;
  fileCheckpoint: boolean;
}

export type AgentRuntime =
  | {
      protocol: "anthropic";
      baseUrl: string;
      auth: "x-api-key" | "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "openai-compatible";
      baseUrl: string;
      auth: "bearer";
      capabilities: AgentRuntimeCapabilities;
    }
  | {
      protocol: "unsupported";
      reason: string;
      capabilities: AgentRuntimeCapabilities;
    };

export interface ProviderConfig {
  presetId: string;
  presetName: string;
  providerId?: string;
  providerName?: string;
  profileId: ProfileId;
  label: string;
  baseUrl: string;
  apiKey: string;
  customProtocol?: CustomProviderProtocol;
  models: ProfileModel[];
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  supportsRemoteModels: boolean;
  agentRuntime: AgentRuntime;
  compatibilityNote?: string;
}

export interface ProviderConnectionConfig extends ProviderConfig {
  providerId: string;
  providerName: string;
  enabled: boolean;
  enabledModelIds: string[];
  defaultModelId: string | null;
}

export interface BuiltInProfile {
  id: Exclude<ProfileId, "custom">;
  label: string;
  region?: "Global" | "China" | "Cloud";
  baseUrl: string;
  supportsRemoteModels: boolean;
  agentRuntime: AgentRuntime;
  compatibilityNote?: string;
  models: ProfileModel[];
}

export interface ProviderPresetSummary {
  id: string;
  name: string;
  profileId: ProfileId;
  providerLabel: string;
  baseUrl: string;
  selectedModelId: string | null;
  selectedModelLabel: string | null;
  customProtocol?: CustomProviderProtocol;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  remoteModelsFetchedAt: string;
  compatibilityNote?: string;
}

export interface ProviderModelSelection {
  providerId: string;
  modelId: string;
}

export interface ProviderConnectionSummary {
  id: string;
  name: string;
  profileId: ProfileId;
  providerLabel: string;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  modelCount: number;
  enabledModelCount: number;
  defaultModelId: string | null;
  remoteModelsFetchedAt: string;
  customProtocol?: CustomProviderProtocol;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}

export interface EnabledModelOption {
  providerId: string;
  providerName: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  modelDescription: string;
  customProtocol?: CustomProviderProtocol;
  agentRuntime: AgentRuntime;
  compatibilityNote?: string;
}

export interface ProviderState {
  version?: 3;
  current: ProviderConfig;
  activePresetId: string;
  presets: ProviderPresetSummary[];
  defaultSelection?: ProviderModelSelection | null;
  connections?: ProviderConnectionSummary[];
  enabledModels?: EnabledModelOption[];
  builtIn: BuiltInProfile[];
}

export interface ProviderConnectionState extends ProviderState {
  connection: ProviderConnectionConfig;
}

export interface ProviderPresetMutationState extends ProviderState {
  preset: ProviderConfig;
}

export type ProviderPresetPatch = Partial<
  Pick<
    ProviderConfig,
    "presetName" | "profileId" | "baseUrl" | "apiKey" | "selectedModelId"
  >
> & {
  name?: string;
};

export interface CreateProviderPresetInput {
  name?: string;
  copyFromPresetId?: string;
  activate?: boolean;
}

export interface CreateProviderConnectionInput {
  name?: string;
  profileId?: ProfileId;
  baseUrl?: string;
  apiKey?: string;
  customProtocol?: CustomProviderProtocol;
  enabled?: boolean;
}

export type ProviderConnectionPatch = Partial<
  Pick<
    ProviderConnectionConfig,
    | "providerName"
    | "profileId"
    | "baseUrl"
    | "apiKey"
    | "customProtocol"
    | "enabled"
    | "defaultModelId"
  >
> & {
  name?: string;
};

async function readJsonError(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as { error?: unknown };
    return typeof json.error === "string" ? json.error : null;
  } catch {
    return null;
  }
}

export async function getProvider(): Promise<ProviderState> {
  const res = await fetchSidecar("/settings/provider");
  if (!res.ok) throw new Error(`provider_get_${res.status}`);
  return (await res.json()) as ProviderState;
}

/**
 * Partial update — omit a field to leave it unchanged. apiKey strings of
 * length 0 clear the stored key.
 */
export async function setProvider(patch: {
  profileId?: ProfileId;
  baseUrl?: string;
  apiKey?: string;
  selectedModelId?: string | null;
}): Promise<ProviderConfig> {
  const res = await fetchSidecar("/settings/provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`provider_set_${res.status}`);
  const json = (await res.json()) as { current: ProviderConfig };
  return json.current;
}

export async function getProviderPreset(id: string): Promise<ProviderConfig> {
  const res = await fetchSidecar(
    `/settings/provider/presets/${encodeURIComponent(id)}`,
  );
  if (!res.ok) {
    throw new Error((await readJsonError(res)) ?? `provider_preset_get_${res.status}`);
  }
  const json = (await res.json()) as { preset: ProviderConfig };
  return json.preset;
}

export async function getProviderConnection(
  id: string,
): Promise<ProviderConnectionConfig> {
  const res = await fetchSidecar(
    `/settings/provider/connections/${encodeURIComponent(id)}`,
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_connection_get_${res.status}`,
    );
  }
  const json = (await res.json()) as { connection: ProviderConnectionConfig };
  return json.connection;
}

export async function createProviderConnection(
  input: CreateProviderConnectionInput = {},
): Promise<ProviderConnectionState> {
  const res = await fetchSidecar("/settings/provider/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_connection_create_${res.status}`,
    );
  }
  return (await res.json()) as ProviderConnectionState;
}

export async function updateProviderConnection(
  id: string,
  patch: ProviderConnectionPatch,
): Promise<ProviderConnectionState> {
  const { providerName, ...rest } = patch;
  const body = providerName !== undefined ? { ...rest, name: providerName } : rest;
  const res = await fetchSidecar(
    `/settings/provider/connections/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_connection_update_${res.status}`,
    );
  }
  return (await res.json()) as ProviderConnectionState;
}

export async function deleteProviderConnection(
  id: string,
): Promise<ProviderState> {
  const res = await fetchSidecar(
    `/settings/provider/connections/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_connection_delete_${res.status}`,
    );
  }
  return (await res.json()) as ProviderState;
}

export async function refreshProviderConnectionModels(
  id: string,
): Promise<ProviderConnectionState> {
  const res = await fetchSidecar(
    `/settings/provider/connections/${encodeURIComponent(id)}/models/refresh`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_connection_refresh_${res.status}`,
    );
  }
  return (await res.json()) as ProviderConnectionState;
}

export async function setProviderConnectionEnabledModels(
  id: string,
  input: { modelIds: string[]; defaultModelId?: string | null },
): Promise<ProviderConnectionState> {
  const res = await fetchSidecar(
    `/settings/provider/connections/${encodeURIComponent(id)}/models/enabled`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_connection_models_${res.status}`,
    );
  }
  return (await res.json()) as ProviderConnectionState;
}

export async function setDefaultProviderSelection(
  selection: ProviderModelSelection,
): Promise<ProviderState> {
  const res = await fetchSidecar("/settings/provider/default-selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  });
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_default_selection_${res.status}`,
    );
  }
  return (await res.json()) as ProviderState;
}

export async function createProviderPreset(
  input: CreateProviderPresetInput = {},
): Promise<ProviderPresetMutationState> {
  const res = await fetchSidecar("/settings/provider/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_preset_create_${res.status}`,
    );
  }
  return (await res.json()) as ProviderPresetMutationState;
}

export async function updateProviderPreset(
  id: string,
  patch: ProviderPresetPatch,
): Promise<ProviderPresetMutationState> {
  const { presetName, ...rest } = patch;
  const body = presetName !== undefined ? { ...rest, name: presetName } : rest;
  const res = await fetchSidecar(
    `/settings/provider/presets/${encodeURIComponent(id)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_preset_update_${res.status}`,
    );
  }
  return (await res.json()) as ProviderPresetMutationState;
}

export async function activateProviderPreset(
  id: string,
): Promise<ProviderState> {
  const res = await fetchSidecar(
    `/settings/provider/presets/${encodeURIComponent(id)}/activate`,
    { method: "POST" },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_preset_activate_${res.status}`,
    );
  }
  return (await res.json()) as ProviderState;
}

export async function deleteProviderPreset(
  id: string,
): Promise<ProviderState> {
  const res = await fetchSidecar(
    `/settings/provider/presets/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error(
      (await readJsonError(res)) ?? `provider_preset_delete_${res.status}`,
    );
  }
  return (await res.json()) as ProviderState;
}

export async function fetchProviderModels(patch: {
  profileId?: ProfileId;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ProviderConfig> {
  const res = await fetchSidecar("/settings/provider/fetch-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`provider_fetch_models_${res.status}`);
  const json = (await res.json()) as { current: ProviderConfig };
  return json.current;
}

// User profile — what the agent calls the user, role, custom instructions.
// Composed sidecar-side into the SDK's systemPrompt.append on every turn.

export interface UserProfile {
  callMe: string;
  work: string;
  instructions: string;
}

export async function getProfile(): Promise<UserProfile> {
  const res = await fetchSidecar("/settings/profile");
  if (!res.ok) throw new Error(`profile_get_${res.status}`);
  const json = (await res.json()) as { current: UserProfile };
  return json.current;
}

export async function setProfile(
  patch: Partial<UserProfile>,
): Promise<UserProfile> {
  const res = await fetchSidecar("/settings/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`profile_set_${res.status}`);
  const json = (await res.json()) as { current: UserProfile };
  return json.current;
}
