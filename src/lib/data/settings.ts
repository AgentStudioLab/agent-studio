import { invoke } from "@tauri-apps/api/core";
import { fetchSidecar } from "../sidecar-client";

/**
 * 更新 API key：先写 plugin-store (持久化)，再通知 sidecar 热更新内存。
 * 调用一次完成两件事，UI 不需要分别 invoke。
 */
export async function setApiKey(key: string): Promise<void> {
  await invoke("set_api_key", { key });
  const res = await fetchSidecar("/settings/api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: key.length > 0 ? key : null }),
  });
  if (!res.ok) throw new Error(`api_key_sidecar_${res.status}`);
}
