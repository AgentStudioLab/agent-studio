// 预览环境没有 sidecar 后端。多个视图的 react-query 钩子带 refetchInterval
// （5s/2s 轮询），真实实现会持续 fetch 127.0.0.1 触发 connection-refused，使
// networkidle 永不收敛、package-validate 渲染检查 15s 超时。
//
// 这里让所有 sidecar 调用「立即拒绝、且不发任何网络请求」：react-query 进入 error
// 态、视图照常渲染 loading/empty/error UI（与真实连不上后端时的视觉一致），但因为
// 没有网络流量，networkidle 立即收敛。subscribeSSE 直接 no-op（预览不跑 run）。
// 详见 .design-sync/NOTES.md。

export type SidecarInfo = { port: number; token: string };
export type SSEHandler = (event: { type: string; data: string }) => void;

const unavailable = (): Promise<never> =>
  Promise.reject(new Error("sidecar unavailable in design-sync preview"));

export function getSidecarInfo(): Promise<SidecarInfo> {
  return unavailable();
}

export function fetchSidecar(): Promise<Response> {
  return unavailable();
}

export const authedFetch: typeof fetch = (() => unavailable()) as unknown as typeof fetch;

export async function subscribeSSE(): Promise<void> {
  // 预览不建立 SSE 连接。
}
