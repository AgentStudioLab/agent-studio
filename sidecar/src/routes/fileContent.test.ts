import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFileContentRoutes } from "./fileContent";

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "fileContent-test-"));
  writeFileSync(join(tmpRoot, "hello.txt"), "hello world\n", "utf8");
  writeFileSync(
    join(tmpRoot, "tiny.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
  );
  mkdirSync(join(tmpRoot, "sub"));
  writeFileSync(join(tmpRoot, "sub", "nested.md"), "# nested", "utf8");
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function makeApp() {
  return new Hono().route("/", buildFileContentRoutes());
}

describe("GET /files/content", () => {
  it("returns utf8 content for a text file inside cwd", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(join(tmpRoot, "hello.txt"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { encoding: string; content: string; size: number };
    expect(body.encoding).toBe("utf8");
    expect(body.content).toBe("hello world\n");
    expect(body.size).toBe(12);
  });

  it("returns base64 content for binary files", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(join(tmpRoot, "tiny.png"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { encoding: string; content: string };
    expect(body.encoding).toBe("base64");
    // PNG magic header in base64 starts with iVBORw0KGgo
    expect(body.content.startsWith("iVBORw")).toBe(true);
  });

  it("allows nested paths inside cwd", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(join(tmpRoot, "sub", "nested.md"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string };
    expect(body.content).toBe("# nested");
  });

  it("rejects paths outside cwd with 403", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent("/etc/passwd")}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(403);
  });

  it("rejects .. escape attempts with 403", async () => {
    const app = makeApp();
    const evil = `${tmpRoot}/sub/../../../etc/passwd`;
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(evil)}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when file does not exist", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(join(tmpRoot, "missing.txt"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when path is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when cwd is missing", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(join(tmpRoot, "hello.txt"))}`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when path is a directory", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(join(tmpRoot, "sub"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 413 when file exceeds 2 MiB", async () => {
    const bigFile = join(tmpRoot, "big.bin");
    writeFileSync(bigFile, Buffer.alloc(2 * 1024 * 1024 + 1));
    const app = makeApp();
    const res = await app.request(
      `/files/content?path=${encodeURIComponent(bigFile)}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; size: number };
    expect(body.error).toBe("file too large");
    expect(body.size).toBe(2 * 1024 * 1024 + 1);
  });
});

describe("GET /files/raw", () => {
  it("streams the exact raw bytes with Content-Length", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent(join(tmpRoot, "tiny.png"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    const buf = new Uint8Array(await res.arrayBuffer());
    // 与磁盘字节逐字节相等（无 base64 / 文本转码）
    expect(Array.from(buf)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  });

  it("accepts files over the 2 MiB content cap (raw cap is 100 MiB)", async () => {
    const bigFile = join(tmpRoot, "big.bin");
    writeFileSync(bigFile, Buffer.alloc(2 * 1024 * 1024 + 1));
    const app = makeApp();
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent(bigFile)}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(2 * 1024 * 1024 + 1);
  });

  it("returns 413 when file exceeds 100 MiB (stat-based, no full write needed)", async () => {
    // 用稀疏文件模拟超大文件：truncate 到 100MiB+1，不实际占盘
    const hugeFile = join(tmpRoot, "huge.bin");
    writeFileSync(hugeFile, "");
    const { truncateSync } = await import("node:fs");
    truncateSync(hugeFile, 100 * 1024 * 1024 + 1);
    const app = makeApp();
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent(hugeFile)}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; size: number };
    expect(body.error).toBe("file too large");
    expect(body.size).toBe(100 * 1024 * 1024 + 1);
  });

  it("rejects paths outside cwd with 403", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent("/etc/passwd")}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(403);
  });

  it("rejects .. escape attempts with 403", async () => {
    const app = makeApp();
    const evil = `${tmpRoot}/sub/../../../etc/passwd`;
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent(evil)}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when file does not exist", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent(join(tmpRoot, "missing.txt"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when path is a directory", async () => {
    const app = makeApp();
    const res = await app.request(
      `/files/raw?path=${encodeURIComponent(join(tmpRoot, "sub"))}&cwd=${encodeURIComponent(tmpRoot)}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when path or cwd is missing", async () => {
    const app = makeApp();
    const r1 = await app.request(`/files/raw?cwd=${encodeURIComponent(tmpRoot)}`);
    expect(r1.status).toBe(400);
    const r2 = await app.request(
      `/files/raw?path=${encodeURIComponent(join(tmpRoot, "hello.txt"))}`,
    );
    expect(r2.status).toBe(400);
  });
});
