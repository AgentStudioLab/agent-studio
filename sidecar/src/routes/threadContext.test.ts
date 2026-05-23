import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { SessionMetadataStore } from "../services/sessionMetadata";
import { buildThreadContextRoutes } from "./threadContext";

describe("GET /threads/:id/context", () => {
  it("returns empty payload when thread has no recorded metadata", async () => {
    const store = new SessionMetadataStore();
    const app = new Hono().route("/", buildThreadContextRoutes(store));
    const res = await app.request("/threads/missing/context");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: unknown[]; mcpServers: unknown[] };
    expect(body.skills).toEqual([]);
    expect(body.mcpServers).toEqual([]);
  });

  it("maps mcp_servers from store: connected status → connected:true", async () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", {
      mcpServers: [
        { name: "github", status: "connected" },
        { name: "slack", status: "disconnected" },
        { name: "filesystem", status: "failed_to_connect" },
      ],
      tools: ["Read", "Write"],
    });
    const app = new Hono().route("/", buildThreadContextRoutes(store));
    const res = await app.request("/threads/thr_a/context");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mcpServers: Array<{ name: string; connected: boolean; description: string }>;
    };
    expect(body.mcpServers).toEqual([
      { name: "github", description: "", connected: true },
      { name: "slack", description: "", connected: false },
      { name: "filesystem", description: "", connected: false },
    ]);
  });

  it("returns empty skills array (skill discovery is a follow-up)", async () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", { mcpServers: [], tools: ["Read"] });
    const app = new Hono().route("/", buildThreadContextRoutes(store));
    const res = await app.request("/threads/thr_a/context");
    const body = (await res.json()) as { skills: unknown[] };
    expect(body.skills).toEqual([]);
  });
});
