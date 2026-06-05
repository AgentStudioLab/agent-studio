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

export interface ProfileModel {
  id: string;
  displayName: string;
  description: string;
}

export interface ProviderConfig {
  profileId: ProfileId;
  label: string;
  baseUrl: string;
  apiKey: string;
  models: ProfileModel[];
  remoteModelsFetchedAt: string;
  selectedModelId: string | null;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}

export interface BuiltInProfile {
  id: Exclude<ProfileId, "custom">;
  label: string;
  region?: "Global" | "China" | "Cloud";
  baseUrl: string;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
  models: ProfileModel[];
}

export interface ProviderState {
  current: ProviderConfig;
  builtIn: BuiltInProfile[];
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
