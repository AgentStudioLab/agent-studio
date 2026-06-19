import type { MiddlewareHandler } from "hono";

type RequestLoggerOptions = {
  log?: (line: string) => void;
  now?: () => number;
  // 给高频轮询接口留出静音入口，避免 access log 淹没真正需要排查的请求。
  skipPathPrefixes?: string[];
};

export function createRequestLogger(
  options: RequestLoggerOptions = {},
): MiddlewareHandler {
  const log = options.log ?? console.log;
  const now = options.now ?? (() => performance.now());

  return async (c, next) => {
    const started = now();
    let didThrow = false;
    try {
      await next();
    } catch (err) {
      didThrow = true;
      throw err;
    } finally {
      const url = new URL(c.req.url);
      const path = `${url.pathname}${url.search}`;
      const status = didThrow ? 500 : c.res.status;
      const durationMs = Math.max(0, Math.round(now() - started));
      if (
        options.skipPathPrefixes?.some(
          (prefix) =>
            url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
        )
      ) {
        return;
      }
      log(`[http] ${c.req.method} ${path} -> ${status} ${durationMs}ms`);
    }
  };
}
