# Agent Workspaces — P1 (地基) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mock-only "Projects" concept into a real, persisted **Agent Workspaces** entity — rename projects→agents across the stack, add an `agent_workspaces` table + service + CRUD routes, auto-create a per-agent home directory, bind conversations & scheduled tasks to an agent via `agent_workspace_id`, and make agent-bound runs use the agent's home dir as `cwd`.

**Architecture:** Backend mirrors the existing `ScheduledTaskService` + `buildScheduledRoutes` patterns (class-over-`Database`, `rowToX` mapper, `nanoid` ids, Hono route module, DI in `server.ts`). The per-agent home dir is `~/.agent-studio/agent-workspaces/<id>/`. **P1 keeps cwd resolution simple: a conversation's `working_dir` is set to the agent's home dir at bind time** (on create-in-space, on move-into-space, and on scheduler fire) — so `runWorker` stays untouched. (P2/P3 will move richer per-run resolution — additionalDirectories / CLAUDE.md / memory — into the single `runWorker` path, keyed by `agent_workspace_id`.) `settingSources:["project"]` is turned on globally so a home-dir `CLAUDE.md` auto-loads once P3 writes one. Frontend mirrors the `lib/data/scheduled*.ts` + `@tanstack/react-query` hook patterns.

**Tech Stack:** Bun + Hono + `bun:sqlite` (sidecar); React 19 + react-router + @tanstack/react-query + i18next + Tailwind v4 (frontend). Tests run on **Bun's runner** (`bun test`), never vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-agent-workspaces-design.md` (§§2,4,5,8,9,10,13). This plan implements the **P1** row of §13 only.

**Naming locked:** table `agent_workspaces`; FK column `agent_workspace_id`; TS service `AgentWorkspaceService`; id prefix `agw_`; route base `/agents`; feature dir `src/features/agent-workspaces/`; display 「智能体」/「智能体空间」.

**Out of P1 (do NOT build here):** external folders (`agent_folders`), sandbox `allowWrite`/`additionalDirectories`, CLAUDE.md editing, memory (`agent_memories` + `remember` tool), the detail-page cards (Instructions/Context/Memory/Scheduled wired to real data), the explicit "move conversation into space" UI menu. The backend PATCH that sets a conversation's `agent_workspace_id` IS built (Task 5) so the capability exists; the UI entry point is P2.

---

## File Structure

**Backend (sidecar) — create:**
- `sidecar/src/services/agentWorkspaces.ts` — `AgentWorkspaceService` (CRUD + home-dir mkdir).
- `sidecar/src/services/agentWorkspaces.test.ts` — service tests.
- `sidecar/src/routes/agentWorkspaces.ts` — `buildAgentWorkspaceRoutes` (CRUD + cascade delete).
- `sidecar/src/routes/agentWorkspaces.test.ts` — route tests.
- `sidecar/src/db.test.ts` — migration assertions.

**Backend — modify:**
- `sidecar/src/db.ts` — new table + column rename + `ensureColumn`.
- `sidecar/src/services/threads.ts` — `projectId`→`agentWorkspaceId`; add `updateAgentWorkspace`, `archiveByAgentWorkspace`.
- `sidecar/src/services/scheduledTasks.ts` — `projectId`→`agentWorkspaceId`; add `unbindAgentWorkspace`.
- `sidecar/src/routes/conversations.ts` — `projectId`→`agentWorkspaceId`; bind sets `working_dir`=home; PATCH move.
- `sidecar/src/routes/scheduled.ts` — `projectId`→`agentWorkspaceId`.
- `sidecar/src/services/scheduler.ts` — `resolveProjectCwd`→`resolveAgentHome`; `task.projectId`→`task.agentWorkspaceId`.
- `sidecar/src/server.ts` — construct `AgentWorkspaceService`; mount route; inject into conversations route; wire `resolveAgentHome`.
- `sidecar/src/agui/provider-claude/provider.ts` — add `settingSources: ["project"]`.

**Frontend — create:**
- `src/lib/data/agents.ts` — REST client.
- `src/lib/data/agent-queries.ts` — react-query hooks.
- `src/features/agent-workspaces/AgentsView.tsx`, `AgentCard.tsx`, `NewAgentModal.tsx`, `AgentSpaceView.tsx`.
- `src/i18n/locales/{zh,en}/agents.json`, `src/i18n/locales/{zh,en}/agentSpace.json`.

**Frontend — modify / move / delete:**
- `src/lib/data/types.ts`, `src/lib/data/conversations.ts`, `src/lib/data/scheduled.ts` — `projectId`→`agentWorkspaceId` + `AgentWorkspace` type.
- `src/app/RouterView.tsx`, `src/app/AppShellContext.tsx`, `src/features/sidebar/SidebarContent.tsx` — routes/nav.
- `src/i18n/locales/{zh,en}/index.ts`, `sidebar.json` — register/rename namespaces + nav key.
- Delete: `src/features/projects/`, `src/features/project-detail/`, `src/lib/mock/projects.ts`.

---

## Task 1: DB schema — `agent_workspaces` table + column rename

**Files:**
- Modify: `sidecar/src/db.ts`
- Create: `sidecar/src/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sidecar/src/db.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "./db";

function cols(db: Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (r) => r.name,
  );
}

describe("migrate", () => {
  it("creates the agent_workspaces table", () => {
    const db = new Database(":memory:");
    migrate(db);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_workspaces'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("agent_workspaces");
    expect(cols(db, "agent_workspaces").sort()).toEqual(
      ["archived", "avatar", "created_at", "home_dir", "id", "name", "updated_at"].sort(),
    );
  });

  it("conversations and scheduled_tasks carry agent_workspace_id", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(cols(db, "conversations")).toContain("agent_workspace_id");
    expect(cols(db, "scheduled_tasks")).toContain("agent_workspace_id");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/db.test.ts`
Expected: FAIL — no `agent_workspaces` table; `agent_workspace_id` not in columns.

- [ ] **Step 3: Edit `sidecar/src/db.ts`**

In the `SCHEMA` string, change the `conversations` table's `  project_id    TEXT,` line to:

```
  agent_workspace_id TEXT,
```

Change the `scheduled_tasks` table's `  project_id         TEXT,` line to:

```
  agent_workspace_id TEXT,
```

Add this new table to `SCHEMA` (place it right after the `scheduled_tasks` block, before the closing backtick):

```sql
-- agent_workspaces: a persistent "Agent" — its own home dir (read/write),
-- plus (P2/P3) external folders, a CLAUDE.md instructions file, and memory.
-- Conversations + scheduled_tasks reference it via agent_workspace_id (nullable
-- = the generic/default workspace, i.e. the "new task" behavior).
CREATE TABLE IF NOT EXISTS agent_workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  avatar      TEXT,
  home_dir    TEXT NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

In `migrate()`, append these two lines after the existing `ensureColumn` calls (handles DBs created before the rename — the vestigial `project_id` column on old DBs is left untouched and ignored):

```ts
  ensureColumn(db, "conversations", "agent_workspace_id", "TEXT");
  ensureColumn(db, "scheduled_tasks", "agent_workspace_id", "TEXT");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/db.ts sidecar/src/db.test.ts
git commit -m "feat(sidecar): add agent_workspaces table + agent_workspace_id columns"
```

---

## Task 2: Pure rename `projectId` → `agentWorkspaceId` (existing backend)

No behavior change — only identifiers. After this task the sidecar compiles and existing tests pass.

**Files:**
- Modify: `sidecar/src/services/threads.ts`, `sidecar/src/services/scheduledTasks.ts`, `sidecar/src/routes/conversations.ts`, `sidecar/src/routes/scheduled.ts`, `sidecar/src/services/scheduler.ts`, `sidecar/src/server.ts`

- [ ] **Step 1: `threads.ts`** — apply each replacement (all occurrences):
  - `projectId: string | null;` → `agentWorkspaceId: string | null;` (in `Thread`)
  - `project_id: string | null;` → `agent_workspace_id: string | null;` (in `ThreadRow`)
  - In `rowToThread`: `projectId: r.project_id,` → `agentWorkspaceId: r.agent_workspace_id,`
  - In `create` input type: `projectId?: string | null;` → `agentWorkspaceId?: string | null;`
  - In the `INSERT` SQL: column list `project_id` → `agent_workspace_id`
  - In `create`'s `.run(...)`: `input?.projectId ?? null,` → `input?.agentWorkspaceId ?? null,`

- [ ] **Step 2: `scheduledTasks.ts`** — apply each replacement:
  - `ScheduledTask` interface: `projectId: string | null;` → `agentWorkspaceId: string | null;`
  - `ScheduledTaskRow`: `project_id: string | null;` → `agent_workspace_id: string | null;`
  - `rowToTask`: `projectId: r.project_id,` → `agentWorkspaceId: r.agent_workspace_id,`
  - `CreateScheduledTaskInput`: `projectId?: string | null;` → `agentWorkspaceId?: string | null;`
  - `create`'s INSERT column list: `project_id` → `agent_workspace_id`
  - `create`'s `.run(...)`: `input.projectId ?? null,` → `input.agentWorkspaceId ?? null,`
  - `update`'s patch: `if (patch.projectId !== undefined) push("project_id", patch.projectId);` → `if (patch.agentWorkspaceId !== undefined) push("agent_workspace_id", patch.agentWorkspaceId);`

- [ ] **Step 3: `routes/conversations.ts`** — in the POST `/conversations` body type + call:
  - body type field `projectId?: string | null;` → `agentWorkspaceId?: string | null;`
  - `projectId: body?.projectId ?? null,` → `agentWorkspaceId: body?.agentWorkspaceId ?? null,`

- [ ] **Step 4: `routes/scheduled.ts`** — in POST + PATCH:
  - POST create call `projectId: typeof body.projectId === "string" ? body.projectId : null,` → `agentWorkspaceId: typeof body.agentWorkspaceId === "string" ? body.agentWorkspaceId : null,`
  - PATCH update call: replace the `projectId:` block with
    ```ts
        agentWorkspaceId:
          body.agentWorkspaceId === null || typeof body.agentWorkspaceId === "string"
            ? (body.agentWorkspaceId as string | null)
            : undefined,
    ```

- [ ] **Step 5: `services/scheduler.ts`** — rename the dep + usage:
  - `SchedulerDeps`: rename `resolveProjectCwd?: (projectId: string) => string | null | undefined;` →
    ```ts
      /** Resolve an agent workspace's home dir for agent-bound tasks. Returns
       *  null → the spawned conversation falls back to the default workspace cwd. */
      resolveAgentHome?: (agentWorkspaceId: string) => string | null | undefined;
    ```
  - In `fire`, replace the `cwd` computation + `threads.create` call:
    ```ts
        const cwd =
          task.workingDir ??
          (task.agentWorkspaceId
            ? this.deps.resolveAgentHome?.(task.agentWorkspaceId) ?? null
            : null);
        const thread = this.deps.threads.create({
          title: task.name,
          agentWorkspaceId: task.agentWorkspaceId,
          workingDir: cwd,
          scheduledTaskId: task.id,
          model: task.model,
          permissionMode: task.permissionMode,
        });
    ```

- [ ] **Step 6: `server.ts`** — the `onCreateScheduledTask` callback's `scheduledTasks.create({...})` does NOT pass `projectId`, so no change there. The `Scheduler` constructor (lines ~226-235) does not pass `resolveProjectCwd` today — leave it unset for now (Task 4 adds `resolveAgentHome`). Confirm no remaining `projectId`/`project_id`/`resolveProjectCwd` references in sidecar:

Run: `cd sidecar && rg -n "projectId|project_id|resolveProjectCwd" src` 
Expected: no matches (empty output).

- [ ] **Step 7: Typecheck + existing tests**

Run: `cd sidecar && bunx tsc --noEmit && bun test`
Expected: tsc clean; all existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add sidecar/src
git commit -m "refactor(sidecar): rename projectId → agentWorkspaceId"
```

---

## Task 3: `AgentWorkspaceService` + per-agent home dir

**Files:**
- Create: `sidecar/src/services/agentWorkspaces.ts`
- Create: `sidecar/src/services/agentWorkspaces.test.ts`

- [ ] **Step 1: Write the failing test**

Create `sidecar/src/services/agentWorkspaces.test.ts`:

```ts
import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "./agentWorkspaces";

const baseDirs: string[] = [];
function svc(): { service: AgentWorkspaceService; baseDir: string } {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agw-test-"));
  baseDirs.push(baseDir);
  return { service: new AgentWorkspaceService(db, { baseDir }), baseDir };
}

afterEach(() => {
  for (const d of baseDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("AgentWorkspaceService", () => {
  it("create() persists a row and mkdirs the home dir", () => {
    const { service, baseDir } = svc();
    const a = service.create({ name: "Research" });
    expect(a.id).toMatch(/^agw_/);
    expect(a.name).toBe("Research");
    expect(a.homeDir).toBe(join(baseDir, a.id));
    expect(a.archived).toBe(false);
    expect(existsSync(a.homeDir)).toBe(true);
  });

  it("get / list reflect created rows newest-first", () => {
    const { service } = svc();
    const a = service.create({ name: "A" });
    const b = service.create({ name: "B" });
    expect(service.get(a.id)?.name).toBe("A");
    expect(service.list().map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it("update() changes name + archived; get reflects it", () => {
    const { service } = svc();
    const a = service.create({ name: "Old" });
    const updated = service.update(a.id, { name: "New", archived: true });
    expect(updated?.name).toBe("New");
    expect(updated?.archived).toBe(true);
  });

  it("delete() removes the row (home dir is left on disk)", () => {
    const { service } = svc();
    const a = service.create({ name: "X" });
    service.delete(a.id);
    expect(service.get(a.id)).toBeNull();
    expect(existsSync(a.homeDir)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/services/agentWorkspaces.test.ts`
Expected: FAIL — cannot find module `./agentWorkspaces`.

- [ ] **Step 3: Create `sidecar/src/services/agentWorkspaces.ts`**

```ts
import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { nanoid } from "nanoid";

export interface AgentWorkspace {
  id: string;
  name: string;
  /** InitialsAvatar hue/initials hint, or null. */
  avatar: string | null;
  /** Absolute path to this agent's home dir (read/write workspace). */
  homeDir: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AgentWorkspaceRow {
  id: string;
  name: string;
  avatar: string | null;
  home_dir: string;
  archived: number;
  created_at: number;
  updated_at: number;
}

function rowToAgent(r: AgentWorkspaceRow): AgentWorkspace {
  return {
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    homeDir: r.home_dir,
    archived: r.archived === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface CreateAgentWorkspaceInput {
  id?: string;
  name: string;
  avatar?: string | null;
}

export interface UpdateAgentWorkspaceInput {
  name?: string;
  avatar?: string | null;
  archived?: boolean;
}

/** Default root for per-agent home dirs: ~/.agent-studio/agent-workspaces/<id>/ */
const DEFAULT_BASE_DIR = join(homedir(), ".agent-studio", "agent-workspaces");

export class AgentWorkspaceService {
  private baseDir: string;
  constructor(
    private db: Database,
    opts?: { baseDir?: string },
  ) {
    this.baseDir = opts?.baseDir ?? DEFAULT_BASE_DIR;
  }

  create(input: CreateAgentWorkspaceInput): AgentWorkspace {
    const id = input.id ?? `agw_${nanoid(12)}`;
    const homeDir = join(this.baseDir, id);
    // Create the home dir up front so the SDK never ENOENTs on its first tool.
    mkdirSync(homeDir, { recursive: true });
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_workspaces (id, name, avatar, home_dir, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input.name, input.avatar ?? null, homeDir, now, now);
    return this.get(id)!;
  }

  get(id: string): AgentWorkspace | null {
    const row = this.db
      .prepare("SELECT * FROM agent_workspaces WHERE id = ?")
      .get(id) as AgentWorkspaceRow | undefined;
    return row ? rowToAgent(row) : null;
  }

  /** Resolve just the home dir (used by the scheduler to set spawned cwd). */
  homeDir(id: string): string | null {
    return this.get(id)?.homeDir ?? null;
  }

  list(): AgentWorkspace[] {
    const rows = this.db
      .prepare("SELECT * FROM agent_workspaces WHERE archived = 0 ORDER BY created_at DESC")
      .all() as AgentWorkspaceRow[];
    return rows.map(rowToAgent);
  }

  update(id: string, patch: UpdateAgentWorkspaceInput): AgentWorkspace | null {
    if (!this.get(id)) return null;
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push("name = ?");
      vals.push(patch.name);
    }
    if (patch.avatar !== undefined) {
      sets.push("avatar = ?");
      vals.push(patch.avatar);
    }
    if (patch.archived !== undefined) {
      sets.push("archived = ?");
      vals.push(patch.archived ? 1 : 0);
    }
    sets.push("updated_at = ?");
    vals.push(Date.now());
    this.db
      .prepare(`UPDATE agent_workspaces SET ${sets.join(", ")} WHERE id = ?`)
      .run(...(vals as never[]), id);
    return this.get(id);
  }

  /** Deletes the DB row only. The home dir on disk is intentionally kept
   *  (spec §15: avoid deleting the user's produced files). */
  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_workspaces WHERE id = ?").run(id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd sidecar && bun test src/services/agentWorkspaces.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/services/agentWorkspaces.ts sidecar/src/services/agentWorkspaces.test.ts
git commit -m "feat(sidecar): AgentWorkspaceService with per-agent home dir"
```

---

## Task 4: `/agents` routes (CRUD + cascade delete) + cascade helpers + server wiring

Cascade on delete (spec §15): name's conversations are **archived**, scheduled tasks are **unbound** (`agent_workspace_id` → null, task kept), home dir kept.

**Files:**
- Modify: `sidecar/src/services/threads.ts` (add `archiveByAgentWorkspace`, `updateAgentWorkspace`)
- Modify: `sidecar/src/services/scheduledTasks.ts` (add `unbindAgentWorkspace`)
- Create: `sidecar/src/routes/agentWorkspaces.ts`
- Create: `sidecar/src/routes/agentWorkspaces.test.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: Add cascade/bind helpers to `threads.ts`**

Add these methods to `ThreadService` (after `updateWorkingDir`):

```ts
  /** Move a conversation into / out of an agent workspace. Pass null to
   *  unbind (clears the binding; cwd handling is the route's concern). */
  updateAgentWorkspace(
    id: string,
    agentWorkspaceId: string | null,
    workingDir?: string | null,
  ): Thread {
    if (workingDir !== undefined) {
      this.db
        .prepare(
          "UPDATE conversations SET agent_workspace_id = ?, working_dir = ?, updated_at = ? WHERE id = ?",
        )
        .run(agentWorkspaceId, workingDir, Date.now(), id);
    } else {
      this.db
        .prepare(
          "UPDATE conversations SET agent_workspace_id = ?, updated_at = ? WHERE id = ?",
        )
        .run(agentWorkspaceId, Date.now(), id);
    }
    return this.get(id)!;
  }

  /** Cascade for agent deletion: archive every conversation bound to it. */
  archiveByAgentWorkspace(agentWorkspaceId: string): void {
    this.db
      .prepare(
        "UPDATE conversations SET archived = 1, updated_at = ? WHERE agent_workspace_id = ?",
      )
      .run(Date.now(), agentWorkspaceId);
  }
```

- [ ] **Step 2: Add the unbind helper to `scheduledTasks.ts`**

Add to `ScheduledTaskService` (after `delete`):

```ts
  /** Cascade for agent deletion: unbind tasks (keep the tasks themselves). */
  unbindAgentWorkspace(agentWorkspaceId: string): void {
    this.db
      .prepare(
        "UPDATE scheduled_tasks SET agent_workspace_id = NULL, updated_at = ? WHERE agent_workspace_id = ?",
      )
      .run(Date.now(), agentWorkspaceId);
  }
```

- [ ] **Step 3: Write the failing route test**

Create `sidecar/src/routes/agentWorkspaces.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { ThreadService } from "../services/threads";
import { ScheduledTaskService } from "../services/scheduledTasks";
import { buildAgentWorkspaceRoutes } from "./agentWorkspaces";

function harness() {
  const db = new Database(":memory:");
  migrate(db);
  const baseDir = mkdtempSync(join(tmpdir(), "agw-route-"));
  const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
  const threads = new ThreadService(db);
  const scheduledTasks = new ScheduledTaskService(db);
  const app = buildAgentWorkspaceRoutes({ agentWorkspaces, threads, scheduledTasks });
  return { app, db, baseDir, agentWorkspaces, threads, scheduledTasks };
}

describe("agent workspace routes", () => {
  it("POST /agents creates, GET /agents lists", async () => {
    const { app } = harness();
    const created = await app.request("/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Research" }),
    });
    expect(created.status).toBe(201);
    const agent = (await created.json()) as { id: string; name: string };
    expect(agent.name).toBe("Research");

    const list = await app.request("/agents");
    const agents = (await list.json()) as { id: string }[];
    expect(agents.map((a) => a.id)).toContain(agent.id);
  });

  it("POST /agents rejects an empty name with 400", async () => {
    const { app } = harness();
    const res = await app.request("/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /agents/:id archives bound conversations and unbinds tasks", async () => {
    const { app, agentWorkspaces, threads, scheduledTasks } = harness();
    const agent = agentWorkspaces.create({ name: "Doomed" });
    const conv = threads.create({ agentWorkspaceId: agent.id });
    const task = scheduledTasks.create({
      name: "t",
      prompt: "p",
      frequency: "manual",
      agentWorkspaceId: agent.id,
    });

    const res = await app.request(`/agents/${agent.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(agentWorkspaces.get(agent.id)).toBeNull();
    expect(threads.get(conv.id)?.archived).toBe(true);
    const reloaded = scheduledTasks.get(task.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.agentWorkspaceId).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd sidecar && bun test src/routes/agentWorkspaces.test.ts`
Expected: FAIL — cannot find module `./agentWorkspaces`.

- [ ] **Step 5: Create `sidecar/src/routes/agentWorkspaces.ts`**

```ts
import { Hono } from "hono";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";
import type { ThreadService } from "../services/threads";
import type { ScheduledTaskService } from "../services/scheduledTasks";

export interface MountAgentWorkspaceDeps {
  agentWorkspaces: AgentWorkspaceService;
  threads: ThreadService;
  scheduledTasks: ScheduledTaskService;
}

/**
 * Agent-workspace CRUD.
 *
 *   GET    /agents        list (non-archived, newest first)
 *   POST   /agents        create (mkdirs the home dir)
 *   GET    /agents/:id    detail
 *   PATCH  /agents/:id    partial update (name / avatar / archived)
 *   DELETE /agents/:id    delete row + cascade (archive convos, unbind tasks, keep dir)
 */
export function buildAgentWorkspaceRoutes(deps: MountAgentWorkspaceDeps): Hono {
  const { agentWorkspaces, threads, scheduledTasks } = deps;
  const app = new Hono();

  app.get("/agents", (c) => c.json(agentWorkspaces.list()));

  app.post("/agents", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ error: "invalid_body" }, 400);
    }
    const agent = agentWorkspaces.create({
      name: body.name,
      avatar: typeof body.avatar === "string" ? body.avatar : null,
    });
    return c.json(agent, 201);
  });

  app.get("/agents/:id", (c) => {
    const agent = agentWorkspaces.get(c.req.param("id"));
    if (!agent) return c.json({ error: "not_found" }, 404);
    return c.json(agent);
  });

  app.patch("/agents/:id", async (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: "invalid_body" }, 400);
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim().length === 0)) {
      return c.json({ error: "invalid_name" }, 400);
    }
    const updated = agentWorkspaces.update(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      avatar:
        body.avatar === null || typeof body.avatar === "string"
          ? (body.avatar as string | null)
          : undefined,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
    });
    return c.json(updated);
  });

  app.delete("/agents/:id", (c) => {
    const id = c.req.param("id");
    if (!agentWorkspaces.get(id)) return c.json({ error: "not_found" }, 404);
    // Cascade (spec §15): archive conversations, unbind scheduled tasks, then
    // drop the row. The home dir on disk is intentionally kept.
    threads.archiveByAgentWorkspace(id);
    scheduledTasks.unbindAgentWorkspace(id);
    agentWorkspaces.delete(id);
    return c.json({ ok: true });
  });

  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd sidecar && bun test src/routes/agentWorkspaces.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Wire into `server.ts`**

Add the imports near the other service/route imports:

```ts
import { AgentWorkspaceService } from "./services/agentWorkspaces";
import { buildAgentWorkspaceRoutes } from "./routes/agentWorkspaces";
```

After `const scheduledTasks = new ScheduledTaskService(db);` add:

```ts
const agentWorkspaces = new AgentWorkspaceService(db);
```

In the `Scheduler` constructor options object, add the resolver (after `usage,`):

```ts
  resolveAgentHome: (agentWorkspaceId) => agentWorkspaces.homeDir(agentWorkspaceId),
```

Add the route mount alongside the others (after the `buildScheduledRoutes` line):

```ts
app.route("/", buildAgentWorkspaceRoutes({ agentWorkspaces, threads, scheduledTasks }));
```

- [ ] **Step 8: Typecheck**

Run: `cd sidecar && bunx tsc --noEmit && bun test`
Expected: tsc clean; all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add sidecar/src
git commit -m "feat(sidecar): /agents CRUD routes + delete cascade + scheduler resolveAgentHome"
```

---

## Task 5: Conversation binding (`working_dir` = home at bind time)

A conversation created with `agentWorkspaceId` (or moved into a space) gets its `working_dir` set to the agent's home dir, so the existing `runWorker` (cwd = `thread.workingDir`) runs it in the home — no `runWorker` change needed.

**Files:**
- Modify: `sidecar/src/routes/conversations.ts`
- Modify: `sidecar/src/server.ts` (inject `agentWorkspaces` into conversation routes)
- Modify: `sidecar/src/routes/agentWorkspaces.test.ts` (extend — or add a conversations route test file)

- [ ] **Step 1: Write the failing test**

Append to `sidecar/src/routes/agentWorkspaces.test.ts` a new `describe` (it exercises the conversation route's bind behavior; reuse the same harness style but build the conversations route):

```ts
import { buildConversationRoutes } from "./conversations";
import { createBunSqliteRunStore } from "../agui/store-sqlite";

describe("conversation ↔ agent binding", () => {
  it("POST /conversations with agentWorkspaceId sets working_dir = home", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const baseDir = mkdtempSync(join(tmpdir(), "agw-bind-"));
    const agentWorkspaces = new AgentWorkspaceService(db, { baseDir });
    const threads = new ThreadService(db);
    const store = createBunSqliteRunStore(db);
    const app = buildConversationRoutes({ threads, store, agentWorkspaces });
    const agent = agentWorkspaces.create({ name: "Bound" });

    const res = await app.request("/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentWorkspaceId: agent.id }),
    });
    const conv = (await res.json()) as { id: string; workingDir: string; agentWorkspaceId: string };
    expect(conv.agentWorkspaceId).toBe(agent.id);
    expect(conv.workingDir).toBe(agent.homeDir);

    // PATCH move-out: clearing the binding clears working_dir (→ default cwd).
    const moved = await app.request(`/conversations/${conv.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentWorkspaceId: null }),
    });
    const after = (await moved.json()) as { agentWorkspaceId: string | null };
    expect(after.agentWorkspaceId).toBeNull();
    rmSync(baseDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd sidecar && bun test src/routes/agentWorkspaces.test.ts`
Expected: FAIL — `buildConversationRoutes` doesn't accept `agentWorkspaces`; bind logic missing.

- [ ] **Step 3: Edit `routes/conversations.ts`**

Add the dep + import:

```ts
import type { AgentWorkspaceService } from "../services/agentWorkspaces";
```

```ts
export interface MountConversationsDeps {
  threads: ThreadService;
  store: RunEventStore;
  agentWorkspaces: AgentWorkspaceService;
}
```

Destructure it: `const { threads, store, agentWorkspaces } = deps;`

Replace the POST `/conversations` handler body with:

```ts
  app.post("/conversations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as
      | {
          id?: string;
          title?: string;
          agentWorkspaceId?: string | null;
          workingDir?: string | null;
        }
      | null;
    // Binding an agent seeds cwd = its home dir, unless the caller passed an
    // explicit workingDir (which wins).
    const agentWorkspaceId = body?.agentWorkspaceId ?? null;
    const home = agentWorkspaceId ? agentWorkspaces.homeDir(agentWorkspaceId) : null;
    const t = threads.create({
      id: body?.id,
      title: body?.title,
      agentWorkspaceId,
      workingDir: body?.workingDir ?? home ?? null,
    });
    return c.json(t, 201);
  });
```

In the PATCH `/conversations/:id` handler, extend the body type with `agentWorkspaceId?: string | null;` and add this block (after the `workingDir` block, before `return`):

```ts
    if (body?.agentWorkspaceId !== undefined) {
      if (body.agentWorkspaceId !== null && typeof body.agentWorkspaceId !== "string") {
        return c.json({ error: "invalid_agent_workspace_id" }, 400);
      }
      // Move into a space → working_dir follows the agent home; move out
      // (null) → clear working_dir so it falls back to the default workspace.
      const home = body.agentWorkspaceId
        ? agentWorkspaces.homeDir(body.agentWorkspaceId)
        : null;
      threads.updateAgentWorkspace(id, body.agentWorkspaceId, home);
    }
```

- [ ] **Step 4: Update `server.ts` conversation route mount**

Change `app.route("/", buildConversationRoutes({ threads, store }));` to:

```ts
app.route("/", buildConversationRoutes({ threads, store, agentWorkspaces }));
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd sidecar && bun test src/routes/agentWorkspaces.test.ts && bunx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add sidecar/src
git commit -m "feat(sidecar): bind conversations to agent workspace (working_dir = home)"
```

---

## Task 6: Provider `settingSources: ["project"]`

Turn on project setting-source loading globally so a home-dir `CLAUDE.md` is auto-loaded once P3 writes one. Harmless for unbound threads (default workspace has no CLAUDE.md).

**Files:**
- Modify: `sidecar/src/agui/provider-claude/provider.ts`

- [ ] **Step 1: Edit the `sdkQuery` options**

In `runTurn`'s `options` object (the one passed to `sdkQuery`, around the `cwd: ctx.cwd,` line), add immediately after `cwd: ctx.cwd,`:

```ts
        // Load CLAUDE.md (+ .claude/settings.json) from cwd. Combined with the
        // claude_code systemPrompt preset below, this picks up an agent's
        // home-dir CLAUDE.md (P3). NOTE: also reads <cwd>/.claude/settings.json
        // — the agent home dir contains no such file, so this is a no-op there.
        settingSources: ["project"],
```

- [ ] **Step 2: Typecheck + provider tests**

Run: `cd sidecar && bunx tsc --noEmit && bun test src/agui/provider-claude`
Expected: tsc clean; provider tests PASS.

- [ ] **Step 3: Commit**

```bash
git add sidecar/src/agui/provider-claude/provider.ts
git commit -m "feat(sidecar): enable settingSources project for CLAUDE.md auto-load"
```

---

## Task 7: Frontend data layer — types + `/agents` client + query hooks

**Files:**
- Modify: `src/lib/data/types.ts`
- Modify: `src/lib/data/conversations.ts`
- Modify: `src/lib/data/scheduled.ts`
- Create: `src/lib/data/agents.ts`
- Create: `src/lib/data/agent-queries.ts`

- [ ] **Step 1: `types.ts`** — rename + add the `AgentWorkspace` type:
  - In `Conversation`: `projectId: string | null;` → `agentWorkspaceId: string | null;`
  - In `ScheduledTask`: `projectId: string | null;` → `agentWorkspaceId: string | null;`
  - Append:
    ```ts
    /** A persistent Agent (智能体) — its own home dir + (P2/P3) folders, CLAUDE.md, memory. */
    export interface AgentWorkspace {
      id: string;
      name: string;
      avatar: string | null;
      homeDir: string;
      archived: boolean;
      createdAt: number;
      updatedAt: number;
    }
    ```

- [ ] **Step 2: `conversations.ts`** — in `CreateConversationArgs`: `projectId?: string | null;` → `agentWorkspaceId?: string | null;`

- [ ] **Step 3: `scheduled.ts`** — in `CreateScheduledTaskArgs`: `projectId?: string | null;` → `agentWorkspaceId?: string | null;`

- [ ] **Step 4: Create `src/lib/data/agents.ts`**

```ts
import { authedFetch } from "../sidecar-client";
import type { AgentWorkspace } from "./types";

async function expectJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return (await res.json()) as T;
}

export interface CreateAgentWorkspaceArgs {
  name: string;
  avatar?: string | null;
}
export type UpdateAgentWorkspaceArgs = Partial<CreateAgentWorkspaceArgs> & {
  archived?: boolean;
};

export async function listAgentWorkspaces(): Promise<AgentWorkspace[]> {
  const res = await authedFetch("/agents");
  return expectJson<AgentWorkspace[]>(res);
}

export async function getAgentWorkspace(id: string): Promise<AgentWorkspace> {
  const res = await authedFetch(`/agents/${id}`);
  return expectJson<AgentWorkspace>(res);
}

export async function createAgentWorkspace(
  args: CreateAgentWorkspaceArgs,
): Promise<AgentWorkspace> {
  const res = await authedFetch("/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return expectJson<AgentWorkspace>(res);
}

export async function updateAgentWorkspace(
  id: string,
  patch: UpdateAgentWorkspaceArgs,
): Promise<AgentWorkspace> {
  const res = await authedFetch(`/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return expectJson<AgentWorkspace>(res);
}

export async function deleteAgentWorkspace(id: string): Promise<void> {
  const res = await authedFetch(`/agents/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete_failed_${res.status}`);
}
```

- [ ] **Step 5: Create `src/lib/data/agent-queries.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateAgentWorkspaceArgs,
  createAgentWorkspace,
  deleteAgentWorkspace,
  getAgentWorkspace,
  listAgentWorkspaces,
  type UpdateAgentWorkspaceArgs,
  updateAgentWorkspace,
} from "./agents";

export const agentKeys = {
  all: ["agents"] as const,
  list: ["agents", "list"] as const,
  detail: (id: string) => ["agents", "detail", id] as const,
};

export function useAgentWorkspaces() {
  return useQuery({
    queryKey: agentKeys.list,
    queryFn: () => listAgentWorkspaces(),
    staleTime: 5_000,
  });
}

export function useAgentWorkspace(id: string | null) {
  return useQuery({
    queryKey: agentKeys.detail(id ?? "__none__"),
    queryFn: () => getAgentWorkspace(id!),
    enabled: !!id,
    staleTime: 5_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: agentKeys.list });
  if (id) qc.invalidateQueries({ queryKey: agentKeys.detail(id) });
}

export function useCreateAgentWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: CreateAgentWorkspaceArgs) => createAgentWorkspace(args),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateAgentWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateAgentWorkspaceArgs }) =>
      updateAgentWorkspace(vars.id, vars.patch),
    onSuccess: (a) => invalidate(qc, a.id),
  });
}

export function useDeleteAgentWorkspaceMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAgentWorkspace(id),
    onSuccess: () => invalidate(qc),
  });
}
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: clean except the pre-existing `SkillCard.stories.tsx` `sourcePath` error (ignore that one only). If other errors mention `projectId` in `lib/data` consumers, note them — they're fixed in Tasks 9-10.

> Note: `SidebarContent.tsx` reads `c.id`/`c.title`/`c.updatedAt` only (not `projectId`), so the `Conversation.projectId` rename does not break it. The only `projectId` UI consumers are the projects feature (replaced in Tasks 9-10).

- [ ] **Step 7: Commit**

```bash
git add src/lib/data
git commit -m "feat(web): agent workspaces data client + query hooks; rename projectId"
```

---

## Task 8: i18n — `agents` + `agentSpace` namespaces; sidebar nav key

**Files:**
- Create: `src/i18n/locales/zh/agents.json`, `src/i18n/locales/en/agents.json`
- Create: `src/i18n/locales/zh/agentSpace.json`, `src/i18n/locales/en/agentSpace.json`
- Delete: `src/i18n/locales/zh/projects.json`, `en/projects.json`, `zh/projectDetail.json`, `en/projectDetail.json`
- Modify: `src/i18n/locales/zh/index.ts`, `src/i18n/locales/en/index.ts`
- Modify: `src/i18n/locales/zh/sidebar.json`, `src/i18n/locales/en/sidebar.json`

- [ ] **Step 1: Create `src/i18n/locales/zh/agents.json`**

```json
{
  "title": "智能体空间",
  "subtitle": "每个智能体有自己的工作空间与记忆 —— 在这里管理它们，或新建一个。",
  "newAgent": "新建智能体",
  "sort": "排序",
  "search": "搜索",
  "empty": "还没有智能体，点右上角新建一个。",
  "modal": {
    "title": "新建智能体",
    "name": "名称",
    "namePlaceholder": "例如：周更博客、Q3 市场研究",
    "cancel": "取消",
    "save": "创建"
  }
}
```

- [ ] **Step 2: Create `src/i18n/locales/en/agents.json`**

```json
{
  "title": "Agent Space",
  "subtitle": "Each agent has its own workspace and memory — manage them here, or create a new one.",
  "newAgent": "New agent",
  "sort": "Sort",
  "search": "Search",
  "empty": "No agents yet — create one from the top right.",
  "modal": {
    "title": "New agent",
    "name": "Name",
    "namePlaceholder": "e.g. Weekly blog, Q3 market research",
    "cancel": "Cancel",
    "save": "Create"
  }
}
```

- [ ] **Step 3: Create `src/i18n/locales/zh/agentSpace.json`**

```json
{
  "promptPlaceholder": "在这个智能体空间里开始一个对话…",
  "ask": "询问",
  "notFound": "智能体不存在"
}
```

- [ ] **Step 4: Create `src/i18n/locales/en/agentSpace.json`**

```json
{
  "promptPlaceholder": "Start a conversation in this agent space…",
  "ask": "Ask",
  "notFound": "Agent not found"
}
```

- [ ] **Step 5: Update both `index.ts` files** (`zh` and `en`, identical structure):
  - Replace `import projects from "./projects.json";` with `import agents from "./agents.json";`
  - Replace `import projectDetail from "./projectDetail.json";` with `import agentSpace from "./agentSpace.json";`
  - In the exported object, replace `projects,` with `agents,` and `projectDetail,` with `agentSpace,`

- [ ] **Step 6: Update `sidebar.json` nav key** (both `zh` and `en`):
  - `zh/sidebar.json`: in `nav`, change `"projects": "项目"` → `"agents": "智能体"`
  - `en/sidebar.json`: in `nav`, change `"projects": "Projects"` → `"agents": "Agents"`

- [ ] **Step 7: Delete the old namespaces**

```bash
git rm src/i18n/locales/zh/projects.json src/i18n/locales/en/projects.json \
       src/i18n/locales/zh/projectDetail.json src/i18n/locales/en/projectDetail.json
```

- [ ] **Step 8: Commit** (this leaves the tree temporarily referencing missing namespaces from the old feature; that's fixed in Tasks 9-10 — commit anyway to keep i18n isolated):

```bash
git add src/i18n
git commit -m "feat(web): add agents + agentSpace i18n namespaces, drop projects"
```

---

## Task 9: Agents list — feature dir rename + real data

**Files:**
- Create: `src/features/agent-workspaces/AgentCard.tsx`
- Create: `src/features/agent-workspaces/NewAgentModal.tsx`
- Create: `src/features/agent-workspaces/AgentsView.tsx`
- Delete: `src/features/projects/` (entire dir, including `.stories.tsx`)

- [ ] **Step 1: Create `src/features/agent-workspaces/AgentCard.tsx`**

```tsx
import type { AgentWorkspace } from "@/lib/data/types";

interface AgentCardProps {
  agent: AgentWorkspace;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-6 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <h3 className="font-serif text-[22px] font-medium leading-tight text-foreground">
        {agent.name}
      </h3>
      <span className="text-xs text-muted-foreground">
        {new Date(agent.updatedAt).toLocaleDateString()}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Create `src/features/agent-workspaces/NewAgentModal.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NewAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: { name: string }) => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30";
const LABEL_CLASS = "mb-1.5 block text-[13px] text-text-200";

export function NewAgentModal({ open, onOpenChange, onSave }: NewAgentModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({ name: name.trim() });
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[560px]">
        <DialogHeader className="mb-6">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {t("agents.modal.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="mb-2">
          <label htmlFor="agent-name" className={LABEL_CLASS}>
            {t("agents.modal.name")} <span className="text-danger-100">*</span>
          </label>
          <input
            id="agent-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("agents.modal.namePlaceholder")}
            className={INPUT_CLASS}
          />
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-[13.5px] text-text-200 transition hover:bg-bg-200"
          >
            {t("agents.modal.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-text-100 px-4 py-2 text-[13.5px] font-medium text-bg-100 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("agents.modal.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `src/features/agent-workspaces/AgentsView.tsx`**

```tsx
import { useState } from "react";
import { ArrowUpDown, Search, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { AgentCard } from "@/features/agent-workspaces/AgentCard";
import { NewAgentModal } from "@/features/agent-workspaces/NewAgentModal";
import {
  useAgentWorkspaces,
  useCreateAgentWorkspaceMutation,
} from "@/lib/data/agent-queries";

export function AgentsView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: agents = [] } = useAgentWorkspaces();
  const createMutation = useCreateAgentWorkspaceMutation();
  const [modalOpen, setModalOpen] = useState(false);

  const handleSave = (data: { name: string }) => {
    createMutation.mutate({ name: data.name });
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header
            data-tauri-drag-region
            className="px-12 pb-4 pt-12"
          >
            <div className="flex items-start justify-between gap-4">
              <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
                {t("agents.title")}
              </h1>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                  aria-label={t("agents.sort")}
                >
                  <ArrowUpDown className="size-4" />
                </button>
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                  aria-label={t("agents.search")}
                >
                  <Search className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
                >
                  <Plus className="size-4" /> {t("agents.newAgent")}
                </button>
              </div>
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {t("agents.subtitle")}
            </p>
          </header>
          <section className="grid grid-cols-1 gap-4 px-12 pb-12 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                onClick={() => navigate(`/agents/${a.id}`)}
              />
            ))}
          </section>
          <NewAgentModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSave={handleSave}
          />
        </div>
      }
    />
  );
}
```

- [ ] **Step 4: Delete the old projects feature dir**

```bash
git rm -r src/features/projects
```

- [ ] **Step 5: Commit** (tree still references `ProjectDetailView` in RouterView — fixed in Task 10):

```bash
git add src/features/agent-workspaces
git commit -m "feat(web): AgentsView + AgentCard + NewAgentModal (real /agents data)"
```

---

## Task 10: Agent space detail + routing + sidebar wiring

P1 `AgentSpaceView` is minimal: real agent name in the header + a composer that creates a conversation **bound to the agent** (cwd = home) and navigates to it. The Instructions/Context/Memory/Scheduled cards and the recents list are P2/P3 (so the old `project-detail` cards are deleted here, not moved).

**Files:**
- Create: `src/features/agent-workspaces/AgentSpaceView.tsx`
- Delete: `src/features/project-detail/` (entire dir)
- Modify: `src/app/RouterView.tsx`, `src/features/sidebar/SidebarContent.tsx`, `src/app/AppShellContext.tsx`

- [ ] **Step 1: Create `src/features/agent-workspaces/AgentSpaceView.tsx`**

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { useAgentWorkspace } from "@/lib/data/agent-queries";
import { createConversation } from "@/lib/data/conversations";
import { queryKeys } from "@/lib/data/queries";
import { threadStatusKey } from "@/lib/agui/react/useChat";
import { useAvailableModels } from "@/lib/models";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { SlashEditor } from "@/features/composer/SlashEditor";
import { ModelPicker } from "@/features/task/ModelPicker";

export function AgentSpaceView() {
  const { agentId } = useParams<{ agentId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setPendingFirstPrompt } = useAppShell();
  const { defaultModelId } = useAvailableModels();
  const { data: agent } = useAgentWorkspace(agentId ?? null);
  const [model, setModel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async ({ text }: PromptInputMessage) => {
    if (!agentId || text.trim().length === 0 || submitting) return;
    setSubmitting(true);
    try {
      // Bound conversation → backend sets working_dir = agent home dir.
      const conv = await createConversation({
        title: t("newTask.defaultTitle"),
        agentWorkspaceId: agentId,
      });
      void qc.invalidateQueries({ queryKey: queryKeys.recents });
      void qc.invalidateQueries({ queryKey: threadStatusKey });
      setPendingFirstPrompt({
        conversationId: conv.id,
        text,
        permissionMode: "ask",
        model: model ?? defaultModelId ?? undefined,
      });
      navigate(`/task/${conv.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header
            data-tauri-drag-region
            className="px-12 pb-4 pt-12"
          >
            <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
              {agent?.name ?? t("agentSpace.notFound")}
            </h1>
          </header>
          <section className="flex w-full max-w-[860px] flex-col gap-8 px-12 pb-12">
            <div className="rounded-2xl bg-background">
              <PromptInput onSubmit={handleSubmit}>
                <SlashEditor placeholder={t("agentSpace.promptPlaceholder")} />
                <PromptInputFooter className="px-4 pb-3">
                  <PromptInputTools />
                  <PromptInputTools>
                    <ModelPicker value={model} onChange={setModel} />
                    <PromptInputSubmit />
                  </PromptInputTools>
                </PromptInputFooter>
              </PromptInput>
            </div>
          </section>
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Delete the old project-detail dir**

```bash
git rm -r src/features/project-detail
```

- [ ] **Step 3: Edit `src/app/RouterView.tsx`**
  - Replace the two imports:
    ```tsx
    import { ProjectsView } from "@/features/projects/ProjectsView";
    import { ProjectDetailView } from "@/features/project-detail/ProjectDetailView";
    ```
    with:
    ```tsx
    import { AgentsView } from "@/features/agent-workspaces/AgentsView";
    import { AgentSpaceView } from "@/features/agent-workspaces/AgentSpaceView";
    ```
  - Replace the two routes:
    ```tsx
      <Route path="/projects" element={<ProjectsView />} />
      <Route path="/projects/:projectId" element={<ProjectDetailView />} />
    ```
    with:
    ```tsx
      <Route path="/agents" element={<AgentsView />} />
      <Route path="/agents/:agentId" element={<AgentSpaceView />} />
    ```
  - In the doc comment, change `projectId` → `agentId`.

- [ ] **Step 4: Edit `src/features/sidebar/SidebarContent.tsx`**
  - In the `NavItem` for projects, change:
    ```tsx
        <NavItem
          icon={Briefcase}
          label={t("sidebar.nav.projects")}
          active={pathname.startsWith("/projects")}
          onClick={() => navigate("/projects")}
        />
    ```
    to:
    ```tsx
        <NavItem
          icon={Briefcase}
          label={t("sidebar.nav.agents")}
          active={pathname.startsWith("/agents")}
          onClick={() => navigate("/agents")}
        />
    ```
  - In `PinnedItem`'s `onClick` (the `kind === "project"` branch), change `navigate(\`/projects/${item.id}\`)` → `navigate(\`/agents/${item.id}\`)`.

- [ ] **Step 5: Edit `src/app/AppShellContext.tsx`** — in the `AppShellContextValue` doc comment (the line mentioning `projectId`), change `projectId` → `agentWorkspaceId`. (`FULLSCREEN_ROUTES` is unchanged — `/agents` keeps the sidebar, like `/projects` did.)

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: clean except the pre-existing `SkillCard.stories.tsx` error. If anything still references `@/features/projects`, `@/features/project-detail`, `MockProject`, or `projects` mock — fix per Task 11.

- [ ] **Step 7: Commit**

```bash
git add src/features/agent-workspaces src/app/RouterView.tsx src/features/sidebar/SidebarContent.tsx src/app/AppShellContext.tsx
git commit -m "feat(web): AgentSpaceView + /agents routing + sidebar nav"
```

---

## Task 11: Remove project mock + full verification

**Files:**
- Delete: `src/lib/mock/projects.ts`
- Modify: `src/lib/mock/types.ts` (only if it has a now-unused `MockProject` that nothing imports — see step)

- [ ] **Step 1: Find any remaining references to the project mock**

Run: `rg -n "mock/projects|MockProject|features/projects|features/project-detail|sidebar.nav.projects|projectDetail|projects\\." src`
Expected after Tasks 7-10: matches only inside `src/lib/mock/projects.ts` itself and possibly a `MockProject` interface in `src/lib/mock/types.ts`.

- [ ] **Step 2: Delete the project mock**

```bash
git rm src/lib/mock/projects.ts
```

- [ ] **Step 3: Remove `MockProject` from `src/lib/mock/types.ts`** — ONLY if step 1 shows nothing else imports `MockProject`. Delete the `MockProject` interface (and any project-only sub-types it owns, e.g. `recentConversations` shape, if unused elsewhere). If anything still imports it, leave it and note the consumer.

- [ ] **Step 4: Frontend typecheck**

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: clean except the pre-existing `SkillCard.stories.tsx` `sourcePath` error.

- [ ] **Step 5: Frontend build**

Run: `bunx vite build`
Expected: exit 0, `✓ built`.

- [ ] **Step 6: Frontend tests**

Run: `bun test`
Expected: PASS (no project-feature tests remain; nothing references deleted modules).

- [ ] **Step 7: Sidecar typecheck + tests**

Run: `cd sidecar && bunx tsc --noEmit && bun test`
Expected: tsc clean; all tests PASS (including the new `db`, `agentWorkspaces` service, and route tests).

- [ ] **Step 8: Manual smoke (optional but recommended)**

Run `bun run tauri:dev`, then: sidebar shows 「智能体」; click it → 「智能体空间」 list; create an agent → it appears; open it → composer; send a message → lands in `/task/:id` and the run's cwd is `~/.agent-studio/agent-workspaces/<id>/` (verify a file the agent writes lands there).

- [ ] **Step 9: Commit**

```bash
git add src/lib/mock
git commit -m "chore(web): remove project mock; P1 agent workspaces complete"
```

---

## Self-Review

**Spec coverage (P1 row of §13):**
- Rename projects→agents (dirs/文案/i18n/路由/导航) → Tasks 8, 9, 10. ✓
- `agent_workspaces` 表 + AgentWorkspaceService + routes → Tasks 1, 3, 4. ✓
- 创建时自动建家目录 → Task 3 (`mkdirSync` in `create`). ✓
- `conversations`/`scheduled_tasks` 列 `project_id`→`agent_workspace_id` → Tasks 1, 2. ✓
- runWorker 按绑定解析 cwd=家(交互式与 scheduler 共用) → realized via "bind sets working_dir=home" (Tasks 4, 5) — interactive create-in-space + move + scheduler all funnel `working_dir`=home, and `runWorker` (unchanged) uses `thread.workingDir`. Documented divergence from the spec's "resolve inside runWorker" (deferred to P2/P3 when per-run agent context is needed). ✓
- scheduler `resolveProjectCwd`→`resolveAgentHome` → Tasks 2, 4. ✓
- `settingSources:["project"]` 全局开 → Task 6. ✓
- Delete cascade (§15: archive convos, unbind tasks, keep dir) → Task 4. ✓

**Placeholder scan:** No "TBD"/"implement later"/"add validation"/"similar to". Every code step has full code; every rename step lists exact strings; every run step has a command + expected output. ✓

**Type/name consistency:** Backend `agentWorkspaceId` (camel) ↔ `agent_workspace_id` (snake) used consistently; `AgentWorkspace.homeDir` ↔ row `home_dir`; service methods `homeDir(id)`, `archiveByAgentWorkspace`, `unbindAgentWorkspace`, `updateAgentWorkspace` are defined (Tasks 3-4) before use (Tasks 4-5); route base `/agents`; frontend `AgentWorkspace` type, `agentKeys`, `useAgentWorkspaces`/`useAgentWorkspace`/`use*Mutation` defined (Task 7) before use (Tasks 9-10). `createConversation({ agentWorkspaceId })` (Task 7 arg rename) matches the route (Task 5). ✓

**Ordering:** Schema → rename → service → routes/wiring → binding → provider → frontend data → i18n → list → detail/routing → cleanup. Each backend task compiles + tests green before the next. Frontend Tasks 7-8 commit a tree that briefly references the old feature (resolved by Tasks 9-11) — flagged inline. ✓
