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
});
