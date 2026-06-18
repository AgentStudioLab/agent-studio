import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { ThreadService } from "../services/threads";
import { ScheduledTaskService } from "../services/scheduledTasks";
import { builtinAgentId, reconcileBuiltinAgents } from "../services/builtinAgents";
import type { BuiltinAgentDef } from "../builtins/agents";
import { buildAgentWorkspaceRoutes } from "./agentWorkspaces";
import { buildAgentInstructionRoutes } from "./agentInstructions";

const DEF: BuiltinAgentDef = {
  slug: "official",
  name: "Official",
  avatar: "blue",
  instructions: "official instr",
  mountedSkills: ["s1"],
};

const baseDirs: string[] = [];
function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "builtin-route-"));
  baseDirs.push(baseDir);
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  reconcileBuiltinAgents(db, baseDir, [DEF]);
  const threads = new ThreadService(db);
  const scheduledTasks = new ScheduledTaskService(db);
  const app = new Hono();
  app.route("/", buildAgentWorkspaceRoutes({ agentWorkspaces, threads, scheduledTasks }));
  app.route("/", buildAgentInstructionRoutes({ agentWorkspaces }));
  return { app, db, baseDir, agentWorkspaces };
}
afterEach(() => {
  for (const d of baseDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const BUILTIN_ID = builtinAgentId("official");
const json = (body: unknown) => ({
  method: "PATCH" as const,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("builtin agent read-only guards", () => {
  it("PATCH definition field (name) on builtin → 403", async () => {
    const { app } = harness();
    const res = await app.request(`/agents/${BUILTIN_ID}`, json({ name: "Hacked" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("builtin_readonly");
  });

  it("PATCH pin-only on builtin → 200 (user-owned, allowed)", async () => {
    const { app, agentWorkspaces } = harness();
    const res = await app.request(`/agents/${BUILTIN_ID}`, json({ pinned: true }));
    expect(res.status).toBe(200);
    expect(agentWorkspaces.get(BUILTIN_ID)?.pinned).toBe(true);
  });

  it("DELETE builtin → 403", async () => {
    const { app, agentWorkspaces } = harness();
    const res = await app.request(`/agents/${BUILTIN_ID}`, { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(agentWorkspaces.get(BUILTIN_ID)).not.toBeNull();
  });

  it("PUT instructions on builtin → 403", async () => {
    const { app } = harness();
    const res = await app.request(`/agents/${BUILTIN_ID}/instructions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "overwrite" }),
    });
    expect(res.status).toBe(403);
  });

  it("normal user agent is unaffected by the guard", async () => {
    const { app, agentWorkspaces } = harness();
    const user = agentWorkspaces.create({ name: "Mine" });
    const res = await app.request(`/agents/${user.id}`, json({ name: "Renamed" }));
    expect(res.status).toBe(200);
    expect(agentWorkspaces.get(user.id)?.name).toBe("Renamed");
  });
});

describe("clone", () => {
  it("clones a builtin into an editable user agent (definition only)", async () => {
    const { app, agentWorkspaces } = harness();
    const res = await app.request(`/agents/${BUILTIN_ID}/clone`, { method: "POST" });
    expect(res.status).toBe(201);
    const clone = (await res.json()) as {
      id: string;
      name: string;
      avatar: string | null;
      source: string;
      mountedSkills: string[] | null;
      homeDir: string;
    };
    expect(clone.source).toBe("user");
    expect(clone.name).toBe("Official (副本)");
    expect(clone.avatar).toBe("blue");
    expect(clone.mountedSkills).toEqual(["s1"]);
    expect(clone.id).not.toBe(BUILTIN_ID);
    expect(readFileSync(join(clone.homeDir, "CLAUDE.md"), "utf8")).toBe("official instr");
    // 克隆是可编辑的：改名 200。
    const patched = await app.request(`/agents/${clone.id}`, json({ name: "Tweaked" }));
    expect(patched.status).toBe(200);
    expect(agentWorkspaces.get(clone.id)?.name).toBe("Tweaked");
  });
});
