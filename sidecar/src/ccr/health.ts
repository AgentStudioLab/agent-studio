interface HealthWaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  probeTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

async function sleep(ms: number): Promise<void> {
  await Bun.sleep(ms);
}

export async function waitForPortClosed(
  baseUrl: string,
  options: HealthWaitOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 3_000;
  const intervalMs = options.intervalMs ?? 100;
  const probeTimeoutMs = options.probeTimeoutMs ?? Math.min(1_000, timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await fetchWithTimeout(fetchImpl, baseUrl, probeTimeoutMs, "ccr_port_close_probe_timeout");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "ccr_port_close_probe_timeout"
      ) {
        lastError = err;
        await sleep(intervalMs);
        continue;
      }
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(
    lastError instanceof Error
      ? `ccr_port_still_open:${lastError.message}`
      : "ccr_port_still_open",
  );
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<Response> {
  let timer: Timer | undefined;
  try {
    return await Promise.race([
      fetchImpl(url),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function waitForCcrReady(
  baseUrl: string,
  options: HealthWaitOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 250;
  const probeTimeoutMs = options.probeTimeoutMs ?? Math.min(2_000, timeoutMs);
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        baseUrl,
        probeTimeoutMs,
        "ccr_ready_probe_timeout",
      );
      if (response.status < 500) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `ccr_not_ready:${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
