import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBunSqliteRunStore } from "../agui/store-sqlite";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { ThreadService } from "../services/threads";
import { buildConversationRoutes } from "./conversations";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "conversation-route-"));
  const threads = new ThreadService(db);
  const store = createBunSqliteRunStore(db);
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const app = buildConversationRoutes({ threads, store, agentWorkspaces });
  return { app, db, baseDir, threads };
}

describe("conversation routes — model", () => {
  it("POST /conversations stores the optional model", async () => {
    const { app, baseDir } = harness();
    try {
      const res = await app.request("/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Model thread", model: "gpt-5.1" }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { model: string | null };
      expect(body.model).toBe("gpt-5.1");
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("PATCH /conversations/:id updates and clears the model", async () => {
    const { app, baseDir, threads } = harness();
    try {
      const thread = threads.create({ title: "Model patch" });

      const setRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "deepseek-ai/DeepSeek-V3.2" }),
      });
      expect(setRes.status).toBe(200);
      expect(((await setRes.json()) as { model: string | null }).model).toBe(
        "deepseek-ai/DeepSeek-V3.2",
      );
      expect(threads.get(thread.id)?.model).toBe("deepseek-ai/DeepSeek-V3.2");

      const clearRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: null }),
      });
      expect(clearRes.status).toBe(200);
      expect(((await clearRes.json()) as { model: string | null }).model).toBeNull();
      expect(threads.get(thread.id)?.model).toBeNull();
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("PATCH /conversations/:id rejects empty and non-string model values", async () => {
    const { app, baseDir, threads } = harness();
    try {
      const thread = threads.create({ title: "Invalid model patch" });

      const emptyRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "" }),
      });
      expect(emptyRes.status).toBe(400);
      expect(await emptyRes.json()).toEqual({ error: "invalid_model" });

      const numberRes = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: 123 }),
      });
      expect(numberRes.status).toBe(400);
      expect(await numberRes.json()).toEqual({ error: "invalid_model" });
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("PATCH /conversations/:id does not persist model when a later field is invalid", async () => {
    const { app, baseDir, threads } = harness();
    try {
      const thread = threads.create({
        title: "Invalid mixed patch",
        model: "existing-model",
      });

      const res = await app.request(`/conversations/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-5.1", agentWorkspaceId: 123 }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_agent_workspace_id" });
      expect(threads.get(thread.id)?.model).toBe("existing-model");
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
