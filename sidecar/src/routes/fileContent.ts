import { Hono } from "hono";
import { stat, readFile } from "node:fs/promises";
import { normalize, resolve } from "node:path";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
// raw 端点上限：rich 文档（pdf/docx/xlsx）需要完整字节才能解析。传输是流式的，
// 但 docx/xlsx 解析仍需整文件入 webview 内存，100 MiB 是「能预览绝大多数真实
// 文档」与「不冻死 webview」之间的折中（见设计文档 §3）。
const MAX_RAW_BYTES = 100 * 1024 * 1024; // 100 MiB

/**
 * 共享沙箱校验 + stat。/files/content 与 /files/raw 的安全边界必须完全一致：
 * path 规范化后必须落在 cwd 内（纯字符串前缀判断，symlink 逃逸不在范围内）。
 *
 * 返回 ok:false 时带上可直接 c.json(...) 的错误三元组。
 */
async function resolveSandboxedFile(
  path: string | undefined,
  cwd: string | undefined,
  maxBytes: number,
): Promise<
  | { ok: true; absPath: string; size: number }
  | { ok: false; status: 400 | 403 | 404 | 413 | 500; body: Record<string, unknown> }
> {
  if (!path) return { ok: false, status: 400, body: { error: "missing path" } };
  if (!cwd) return { ok: false, status: 400, body: { error: "missing cwd" } };

  // resolve() 折叠 .. 段并产出绝对路径，校验是规范化后的字符串前缀比较。
  const absPath = resolve(normalize(path));
  const absCwd = resolve(normalize(cwd));
  const cwdPrefix = absCwd.endsWith("/") ? absCwd : absCwd + "/";

  if (absPath !== absCwd && !absPath.startsWith(cwdPrefix)) {
    return { ok: false, status: 403, body: { error: "path outside workspace" } };
  }

  let stats;
  try {
    stats = await stat(absPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: false, status: 404, body: { error: "not found" } };
    return { ok: false, status: 500, body: { error: "read failed", detail: String(err) } };
  }

  if (!stats.isFile()) {
    return { ok: false, status: 404, body: { error: "not found" } };
  }
  if (stats.size > maxBytes) {
    return { ok: false, status: 413, body: { error: "file too large", size: stats.size } };
  }
  return { ok: true, absPath, size: stats.size };
}

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
    const checked = await resolveSandboxedFile(
      c.req.query("path"),
      c.req.query("cwd"),
      MAX_BYTES,
    );
    if (!checked.ok) return c.json(checked.body, checked.status);

    let buf: Buffer;
    try {
      buf = await readFile(checked.absPath);
    } catch (err) {
      return c.json({ error: "read failed", detail: String(err) }, 500);
    }

    // Heuristic binary detection: null byte = binary. Otherwise try UTF-8
    // decode; if any U+FFFD replacement chars appear, treat as binary.
    if (buf.includes(0)) {
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64" as const,
        size: checked.size,
      });
    }
    const utf8 = buf.toString("utf8");
    if (utf8.includes("�")) {
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64" as const,
        size: checked.size,
      });
    }
    return c.json({
      content: utf8,
      encoding: "utf8" as const,
      size: checked.size,
    });
  });

  // GET /files/raw — 原始字节流，供 rich 文档预览（pdf/docx/xlsx）使用。
  //
  // 与 /files/content 的区别：
  //   - 不做 base64 编码（省 33% 体积），直接流式输出文件字节；
  //   - 上限 100 MiB（content 端点是 2 MiB）；
  //   - 带 Content-Length，前端按块读取时据此计算下载进度。
  // 沙箱校验与 content 端点共用 resolveSandboxedFile，安全边界一致。
  app.get("/files/raw", async (c) => {
    const checked = await resolveSandboxedFile(
      c.req.query("path"),
      c.req.query("cwd"),
      MAX_RAW_BYTES,
    );
    if (!checked.ok) return c.json(checked.body, checked.status);

    // Bun.file().stream() 按块读盘，不会把整个文件读进 sidecar 内存。
    const file = Bun.file(checked.absPath);
    return new Response(file.stream(), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(checked.size),
      },
    });
  });

  return app;
}
