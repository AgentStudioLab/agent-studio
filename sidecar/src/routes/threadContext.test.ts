import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { SessionMetadataStore } from "../services/sessionMetadata";
import { SkillInvocationStore } from "../agui/provider-claude/skill-invocations";
import type { SkillRegistry, SkillView } from "../services/skillRegistry";
import { buildThreadContextRoutes } from "./threadContext";

function makeRegistryStub(skills: SkillView[]): SkillRegistry {
  return { listSkills: () => skills } as unknown as SkillRegistry;
}

function makeApp(opts: {
  meta?: SessionMetadataStore;
  invocations?: SkillInvocationStore;
  registry?: SkillRegistry;
}) {
  const meta = opts.meta ?? new SessionMetadataStore();
  const invocations = opts.invocations ?? new SkillInvocationStore();
  const registry = opts.registry ?? makeRegistryStub([]);
  return new Hono().route(
    "/",
    buildThreadContextRoutes(meta, invocations, registry),
  );
}

describe("GET /threads/:id/context", () => {
  it("returns empty payload when thread has no recorded metadata", async () => {
    const app = makeApp({});
    const res = await app.request("/threads/missing/context");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: unknown[]; mcpServers: unknown[] };
    expect(body.skills).toEqual([]);
    expect(body.mcpServers).toEqual([]);
  });

  it("maps mcp_servers from store: connected status → connected:true", async () => {
    const meta = new SessionMetadataStore();
    meta.upsert("thr_a", {
      mcpServers: [
        { name: "github", status: "connected" },
        { name: "slack", status: "disconnected" },
        { name: "filesystem", status: "failed_to_connect" },
      ],
      tools: ["Read", "Write"],
    });
    const app = makeApp({ meta });
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

  it("hydrates invoked skills via registry (known ids get name + description)", async () => {
    const invocations = new SkillInvocationStore();
    invocations.record("thr_a", "agent-studio:pptx");
    const registry = makeRegistryStub([
      {
        id: "agent-studio:pptx",
        name: "pptx",
        description: "Build PowerPoint decks",
        source: "builtin",
        sourcePath: "/tmp/built-in",
        enabled: true,
      },
    ]);
    const app = makeApp({ invocations, registry });
    const res = await app.request("/threads/thr_a/context");
    const body = (await res.json()) as { skills: Array<{ id: string; name: string; description: string }> };
    expect(body.skills).toEqual([
      { id: "agent-studio:pptx", name: "pptx", description: "Build PowerPoint decks" },
    ]);
  });

  it("falls back to id as name when invoked skill is unknown to registry", async () => {
    const invocations = new SkillInvocationStore();
    invocations.record("thr_a", "ghost-skill");
    const app = makeApp({ invocations });
    const res = await app.request("/threads/thr_a/context");
    const body = (await res.json()) as { skills: Array<{ id: string; name: string; description: string }> };
    expect(body.skills).toEqual([
      { id: "ghost-skill", name: "ghost-skill", description: "" },
    ]);
  });

  it("isolates invocations across threads", async () => {
    const invocations = new SkillInvocationStore();
    invocations.record("thr_a", "agent-studio:pptx");
    invocations.record("thr_b", "agent-studio:docx");
    const app = makeApp({ invocations });
    const resA = await app.request("/threads/thr_a/context");
    const bodyA = (await resA.json()) as { skills: Array<{ id: string }> };
    expect(bodyA.skills.map((s) => s.id)).toEqual(["agent-studio:pptx"]);
  });
});
