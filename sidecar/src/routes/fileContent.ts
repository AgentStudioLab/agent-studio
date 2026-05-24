import { Hono } from "hono";
import { stat, readFile } from "node:fs/promises";
import { normalize, resolve } from "node:path";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB

/**
 * GET /files/content — read a file's contents for the PreviewPane.
 *
 * Sandboxed: only paths inside `cwd` may be read. The conversation's
 * workingDir is passed as `cwd` so each thread's preview can only see
 * files in its own working directory. Matches the SDK's filesystem
 * sandbox spirit — agent-side and UI-side share the same boundary.
 *
 * Binary detection: if the buffer contains a null byte or is not valid
 * UTF-8, return base64. Otherwise utf8. Lets PreviewPane render images
 * via data URI and text via direct render without extra round-trips.
 */
export function buildFileContentRoutes(): Hono {
  const app = new Hono();

  app.get("/files/content", async (c) => {
    const path = c.req.query("path");
    const cwd = c.req.query("cwd");
    if (!path) return c.json({ error: "missing path" }, 400);
    if (!cwd) return c.json({ error: "missing cwd" }, 400);

    // Normalize both paths to canonical absolute form. resolve() collapses
    // .. segments and yields an absolute path. The sandbox check is purely
    // string-prefix after normalization — symlink escape is out of scope.
    const absPath = resolve(normalize(path));
    const absCwd = resolve(normalize(cwd));
    const cwdPrefix = absCwd.endsWith("/") ? absCwd : absCwd + "/";

    if (absPath !== absCwd && !absPath.startsWith(cwdPrefix)) {
      return c.json({ error: "path outside workspace" }, 403);
    }

    let stats;
    try {
      stats = await stat(absPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return c.json({ error: "not found" }, 404);
      return c.json({ error: "read failed", detail: String(err) }, 500);
    }

    if (!stats.isFile()) {
      return c.json({ error: "not found" }, 404);
    }
    if (stats.size > MAX_BYTES) {
      return c.json({ error: "file too large", size: stats.size }, 413);
    }

    let buf: Buffer;
    try {
      buf = await readFile(absPath);
    } catch (err) {
      return c.json({ error: "read failed", detail: String(err) }, 500);
    }

    // Heuristic binary detection: null byte = binary. Otherwise try UTF-8
    // decode; if any U+FFFD replacement chars appear, treat as binary.
    if (buf.includes(0)) {
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64" as const,
        size: stats.size,
      });
    }
    const utf8 = buf.toString("utf8");
    if (utf8.includes("�")) {
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64" as const,
        size: stats.size,
      });
    }
    return c.json({
      content: utf8,
      encoding: "utf8" as const,
      size: stats.size,
    });
  });

  return app;
}
