import { Hono } from "hono";
import type {
  Frequency,
  ScheduledTaskService,
} from "../services/scheduledTasks";
import type { ThreadService } from "../services/threads";
import type { Scheduler } from "../services/scheduler";
import type { RunEventStore } from "../agui/core";

export interface MountScheduledDeps {
  tasks: ScheduledTaskService;
  threads: ThreadService;
  store: RunEventStore;
  scheduler: Scheduler;
}

const FREQUENCIES: Frequency[] = [
  "manual",
  "hourly",
  "daily",
  "weekdays",
  "weekly",
];

function isFrequency(v: unknown): v is Frequency {
  return typeof v === "string" && (FREQUENCIES as string[]).includes(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * Scheduled-task CRUD + on-demand run + run history.
 *
 *   GET    /scheduled            list all tasks
 *   POST   /scheduled            create (computes next_run_at)
 *   GET    /scheduled/:id        detail
 *   PATCH  /scheduled/:id        partial update (recomputes next_run_at on cadence change)
 *   DELETE /scheduled/:id        delete
 *   POST   /scheduled/:id/run    "Run now" → fire immediately → { threadId, runId }
 *   GET    /scheduled/:id/runs   run history (spawned conversations + status)
 */
export function buildScheduledRoutes(deps: MountScheduledDeps): Hono {
  const { tasks, threads, store, scheduler } = deps;
  const app = new Hono();

  app.get("/scheduled", (c) => c.json(tasks.list()));

  app.post("/scheduled", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (
      !body ||
      typeof body.name !== "string" ||
      body.name.length === 0 ||
      typeof body.prompt !== "string" ||
      body.prompt.length === 0 ||
      !isFrequency(body.frequency)
    ) {
      return c.json({ error: "invalid_body" }, 400);
    }
    if (body.allowedTools !== undefined && !isStringArray(body.allowedTools)) {
      return c.json({ error: "invalid_allowed_tools" }, 400);
    }
    const task = tasks.create({
      name: body.name,
      description: typeof body.description === "string" ? body.description : "",
      prompt: body.prompt,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      workingDir: typeof body.workingDir === "string" ? body.workingDir : null,
      model: typeof body.model === "string" ? body.model : null,
      permissionMode:
        body.permissionMode === "act-without-asking" ? "act-without-asking" : "ask",
      frequency: body.frequency,
      timeOfDay: typeof body.timeOfDay === "string" ? body.timeOfDay : null,
      weekday: typeof body.weekday === "number" ? body.weekday : null,
      enabled: body.enabled === false ? false : true,
      allowedTools: isStringArray(body.allowedTools) ? body.allowedTools : undefined,
    });
    return c.json(task, 201);
  });

  app.get("/scheduled/:id", (c) => {
    const task = tasks.get(c.req.param("id"));
    if (!task) return c.json({ error: "not_found" }, 404);
    return c.json(task);
  });

  app.patch("/scheduled/:id", async (c) => {
    const id = c.req.param("id");
    if (!tasks.get(id)) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);
    if (body.frequency !== undefined && !isFrequency(body.frequency)) {
      return c.json({ error: "invalid_frequency" }, 400);
    }
    if (body.allowedTools !== undefined && !isStringArray(body.allowedTools)) {
      return c.json({ error: "invalid_allowed_tools" }, 400);
    }
    const updated = tasks.update(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description:
        typeof body.description === "string" ? body.description : undefined,
      prompt: typeof body.prompt === "string" ? body.prompt : undefined,
      projectId:
        body.projectId === null || typeof body.projectId === "string"
          ? (body.projectId as string | null)
          : undefined,
      workingDir:
        body.workingDir === null || typeof body.workingDir === "string"
          ? (body.workingDir as string | null)
          : undefined,
      model:
        body.model === null || typeof body.model === "string"
          ? (body.model as string | null)
          : undefined,
      permissionMode:
        body.permissionMode === "ask" || body.permissionMode === "act-without-asking"
          ? body.permissionMode
          : undefined,
      frequency: isFrequency(body.frequency) ? body.frequency : undefined,
      timeOfDay:
        body.timeOfDay === null || typeof body.timeOfDay === "string"
          ? (body.timeOfDay as string | null)
          : undefined,
      weekday:
        body.weekday === null || typeof body.weekday === "number"
          ? (body.weekday as number | null)
          : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      allowedTools: isStringArray(body.allowedTools)
        ? body.allowedTools
        : undefined,
    });
    return c.json(updated);
  });

  app.delete("/scheduled/:id", (c) => {
    tasks.delete(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/scheduled/:id/run", async (c) => {
    const task = tasks.get(c.req.param("id"));
    if (!task) return c.json({ error: "not_found" }, 404);
    const result = await scheduler.fire(task);
    return c.json(result, 202);
  });

  app.get("/scheduled/:id/runs", async (c) => {
    const id = c.req.param("id");
    if (!tasks.get(id)) return c.json({ error: "not_found" }, 404);
    const spawned = threads.listByScheduledTask(id);
    const statuses = await store.listThreadStatuses();
    const statusMap = new Map(statuses.map((s) => [s.threadId, s]));
    const runs = spawned.map((t) => {
      const st = statusMap.get(t.id);
      return {
        threadId: t.id,
        title: t.title,
        status: st?.status ?? "idle",
        lastRunId: st?.lastRunId ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });
    return c.json(runs);
  });

  return app;
}
