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
