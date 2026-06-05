import type { MiddlewareHandler } from "hono";

type RequestLoggerOptions = {
  log?: (line: string) => void;
  now?: () => number;
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
      log(`[http] ${c.req.method} ${path} -> ${status} ${durationMs}ms`);
    }
  };
}
