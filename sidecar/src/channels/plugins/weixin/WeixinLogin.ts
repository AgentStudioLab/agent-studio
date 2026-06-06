const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const BOT_TYPE = "3";
const POLL_TIMEOUT_MS = 35_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_QR_RETRIES = 3;

export interface LoginCallbacks {
  onQR: (qrcodeUrl: string, qrcodeData: string) => void;
  onScanned: () => void;
  onDone: (result: { accountId: string; botToken: string; baseUrl: string }) => void;
  onError: (error: Error) => void;
}

export interface LoginHandle {
  abort: () => void;
}

export interface LoginOptions {
  fetchImpl?: typeof fetch;
  pollDelayMs?: number;
}

export function startLogin(
  callbacks: LoginCallbacks,
  options: LoginOptions = {},
): LoginHandle {
  const abortController = new AbortController();
  void runLoginFlow(callbacks, abortController.signal, options).catch((error) => {
    if (!abortController.signal.aborted) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { abort: () => abortController.abort() };
}

async function runLoginFlow(
  callbacks: LoginCallbacks,
  signal: AbortSignal,
  options: LoginOptions,
): Promise<void> {
  let qrRetries = 0;
  while (qrRetries < MAX_QR_RETRIES) {
    if (signal.aborted) return;
    const qr = await get<{ qrcode: string; qrcode_img_content: string }>(
      DEFAULT_BASE_URL,
      `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`,
      signal,
      REQUEST_TIMEOUT_MS,
      options.fetchImpl,
    );
    if (!qr.qrcode || !qr.qrcode_img_content) {
      throw new Error(`Invalid QR code response: ${JSON.stringify(qr)}`);
    }
    callbacks.onQR(qr.qrcode_img_content, qr.qrcode);
    const poll = await pollQRStatus(qr.qrcode, callbacks, signal, options);
    if (poll === "expired") {
      qrRetries++;
      continue;
    }
    if (poll === "aborted") return;
    callbacks.onDone(poll);
    return;
  }
  callbacks.onError(new Error("QR code expired too many times"));
}

type PollResult =
  | "expired"
  | "aborted"
  | { accountId: string; botToken: string; baseUrl: string };

function redactConfirmedLoginResponse(
  result: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [
      key,
      key.toLowerCase().includes("token") ? "[redacted]" : value,
    ]),
  );
}

async function pollQRStatus(
  qrcode: string,
  callbacks: LoginCallbacks,
  signal: AbortSignal,
  options: LoginOptions,
): Promise<PollResult> {
  while (!signal.aborted) {
    const result = await get<{
      status: "wait" | "scaned" | "expired" | "confirmed";
      bot_token?: string;
      baseurl?: string;
      ilink_bot_id?: string;
    }>(
      DEFAULT_BASE_URL,
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      signal,
      POLL_TIMEOUT_MS,
      options.fetchImpl,
    );
    if (result.status === "wait") {
      if (options.pollDelayMs != null && options.pollDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.pollDelayMs));
      }
      continue;
    }
    if (result.status === "scaned") {
      callbacks.onScanned();
      continue;
    }
    if (result.status === "expired") return "expired";
    if (!result.bot_token || !result.ilink_bot_id) {
      throw new Error("Missing bot_token or ilink_bot_id in confirmed response");
    }
    console.log(
      "[channels:weixin] confirmed login response",
      redactConfirmedLoginResponse(result as Record<string, unknown>),
    );
    return {
      accountId: result.ilink_bot_id,
      botToken: result.bot_token,
      baseUrl: result.baseurl || DEFAULT_BASE_URL,
    };
  }
  return "aborted";
}

async function get<T>(
  baseUrl: string,
  pathWithQuery: string,
  signal: AbortSignal,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(pathWithQuery, base);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { "iLink-App-ClientVersion": "1" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${pathWithQuery}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export { POLL_TIMEOUT_MS, REQUEST_TIMEOUT_MS, MAX_QR_RETRIES };
