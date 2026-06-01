# 智能体文件式记忆 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把智能体记忆从 `agent_memories` DB 表（行模型 + profile/facts block + 全量注入）改为家目录里的 markdown 文件：单一 `MEMORY.md` 索引 + 每场景一个 `<slug>.md`，索引常驻注入、正文按需读。

**Architecture:** 新增 `AgentMemoryStore`（文件 IO + 按 agent 串行锁 + 原子写 + 索引维护）替代 `AgentMemoryService`。`remember` MCP 工具去掉 `block`、改成 `save`/`remove` 写文件并同步索引。runWorker 注入 `CLAUDE.md` + `MEMORY.md` 索引。前端 Memory 卡变成**只读** `FileTree` + PreviewPane，复用现有 `walkTree`/`/files/content`。预发布直接清表，不迁移。

**Tech Stack:** Bun + Hono + bun:sqlite（sidecar），React 19 + TanStack Query + shadcn/ai-elements（前端），bun:test，design-tokens 3 层。

参考 spec：`docs/superpowers/specs/2026-06-01-agent-file-based-memory-design.md`。

提交规范：每次提交信息结尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。直接在 `main` 实施。

---

## File Structure

**后端（sidecar/src）**
- 新增 `services/agentMemoryStore.ts` — 文件式记忆服务（核心）。
- 新增 `services/agentMemoryStore.test.ts`。
- 改 `agui/provider-claude/remember-tool.ts` — 去 block，save/remove。
- 改 `agui/provider-claude/remember-tool.test.ts`。
- 改 `server.ts` — onRemember dispatch、wire store、卸载旧 memory 路由。
- 改 `agent/runWorker.ts` — 注入改为 CLAUDE.md + 索引；`RunWorkerInput.agentMemoryStore`。
- 改 `agent/runWorker.test.ts`。
- 改 `routes/runs.ts` — 两处 runWorker 调用传 `agentMemoryStore`。
- 新增 `routes/agentMemory.ts` — `GET /agents/:id/memory/tree`。
- 新增 `routes/agentMemory.test.ts`。
- 改 `services/agentWorkspaces.ts` — create 时 seed `memory/MEMORY.md`。
- 改 `db.ts` — 删 `agent_memories` 表/索引/ensureColumn(block)。
- **删** `services/agentMemories.ts`、`services/agentMemories.test.ts`、`routes/agentMemories.ts`、`routes/agentMemories.test.ts`。

**前端（src）**
- 新增 `lib/data/agent-memory-tree.ts` + `lib/data/agent-memory-tree-queries.ts`。
- 新增 `features/agent-workspaces/MemoryFilesCard.tsx`。
- 改 `features/agent-workspaces/ContextCard.tsx` — MemoryCard → MemoryFilesCard。
- 改 `lib/data/types.ts` — 删 `MemoryBlock`/`AgentMemory`。
- 改 `i18n/locales/{zh,en}/agentSpace.json` — memory.* 键。
- **删** `features/agent-workspaces/MemoryCard.tsx`、`lib/data/agent-memories.ts`、`lib/data/agent-memory-queries.ts`。

---

## Task 1: AgentMemoryStore（文件式记忆服务）

**Files:**
- Create: `sidecar/src/services/agentMemoryStore.ts`
- Test: `sidecar/src/services/agentMemoryStore.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// sidecar/src/services/agentMemoryStore.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentMemoryStore } from "./agentMemoryStore";

// Minimal AgentWorkspaceService stand-in: only homeDir(id) is used.
function makeStore(base: string) {
  const agents = { homeDir: (id: string) => join(base, id) } as never;
  return new AgentMemoryStore(agents);
}

describe("AgentMemoryStore", () => {
  let base: string;
  beforeEach(() => { base = mkdtempSync(join(tmpdir(), "agm-")); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  test("ensure creates memory/ + an index file", () => {
    const s = makeStore(base);
    const dir = s.ensure("a1");
    expect(dir).toBe(join(base, "a1", "memory"));
    expect(existsSync(join(dir!, "MEMORY.md"))).toBe(true);
  });

  test("save (new slug) writes the file and appends an index line", async () => {
    const s = makeStore(base);
    const r = await s.save("a1", { file: "user-profile", title: "User profile", hook: "Jay, 前端工程师", content: "name is Jay" });
    expect(r.status).toBe("ok");
    const dir = join(base, "a1", "memory");
    expect(readFileSync(join(dir, "user-profile.md"), "utf8")).toContain("name is Jay");
    expect(s.indexText("a1")).toContain("- [User profile](user-profile.md) — Jay, 前端工程师");
  });

  test("save (existing slug) overwrites body and upserts (no duplicate index line)", async () => {
    const s = makeStore(base);
    await s.save("a1", { file: "p", title: "P", hook: "v1", content: "old" });
    await s.save("a1", { file: "p", title: "P", hook: "v2", content: "new" });
    const dir = join(base, "a1", "memory");
    expect(readFileSync(join(dir, "p.md"), "utf8")).toContain("new");
    const idx = s.indexText("a1");
    expect(idx).toContain("— v2");
    expect(idx.match(/\(p\.md\)/g)?.length).toBe(1);
  });

  test("remove deletes the file and its index line", async () => {
    const s = makeStore(base);
    await s.save("a1", { file: "p", title: "P", hook: "h", content: "x" });
    const r = await s.remove("a1", "p");
    expect(r.status).toBe("ok");
    expect(existsSync(join(base, "a1", "memory", "p.md"))).toBe(false);
    expect(s.indexText("a1")).not.toContain("(p.md)");
  });

  test("remove of a missing file returns not_found", async () => {
    const s = makeStore(base);
    s.ensure("a1");
    expect((await s.remove("a1", "nope")).status).toBe("not_found");
  });

  test("concurrent saves serialize (both index lines survive)", async () => {
    const s = makeStore(base);
    await Promise.all([
      s.save("a1", { file: "x", title: "X", hook: "hx", content: "cx" }),
      s.save("a1", { file: "y", title: "Y", hook: "hy", content: "cy" }),
    ]);
    const idx = s.indexText("a1");
    expect(idx).toContain("(x.md)");
    expect(idx).toContain("(y.md)");
  });

  test("tree lists the index + scenario files", async () => {
    const s = makeStore(base);
    await s.save("a1", { file: "p", title: "P", hook: "h", content: "x" });
    const names = (await s.tree("a1")).map((n) => n.name).sort();
    expect(names).toEqual(["MEMORY.md", "p.md"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test src/services/agentMemoryStore.test.ts`
Expected: FAIL（`Cannot find module './agentMemoryStore'`）。

- [ ] **Step 3: 实现 AgentMemoryStore**

```ts
// sidecar/src/services/agentMemoryStore.ts
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { walkTree, type TreeNode } from "../lib/fileTree";
import type { AgentWorkspaceService } from "./agentWorkspaces";

export const MEMORY_DIR = "memory";
export const MEMORY_INDEX = "MEMORY.md";

/** Always-on index budget (chars; tokenizer-free proxy). Only the index is
 *  injected, so this caps the always-on cost. */
export const MEMORY_INDEX_BUDGET = { soft: 2000, warn: 1600, hard: 2800 };

const INDEX_HEADER =
  "# Memory index\n\n" +
  "<!-- One line per scenario memory: - [Title](slug.md) — hook. " +
  "Read the linked file for detail. Maintained by the remember tool. -->\n\n";

export type MemoryEditResult =
  | { status: "ok"; message: string }
  | { status: "not_found" };

export interface MemorySaveInput {
  /** scenario slug, without .md */
  file: string;
  title: string;
  hook: string;
  content: string;
}

/** kebab-case, strip path separators / .md / unsafe chars. */
export function sanitizeSlug(file: string): string {
  return file
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "memory";
}

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/** Upsert a `- [title](slug.md) — hook` line keyed by `(slug.md)`. */
export function upsertIndexLine(indexPath: string, slug: string, title: string, hook: string): void {
  const line = `- [${title}](${slug}.md) — ${hook}`;
  const cur = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : INDEX_HEADER;
  const needle = `](${slug}.md)`;
  const lines = cur.split("\n");
  const i = lines.findIndex((l) => l.includes(needle));
  if (i >= 0) lines[i] = line;
  else {
    if (cur.length > 0 && !cur.endsWith("\n")) lines.push("");
    lines.push(line);
  }
  writeAtomic(indexPath, lines.join("\n").replace(/\n*$/, "\n"));
}

export function removeIndexLine(indexPath: string, slug: string): void {
  if (!existsSync(indexPath)) return;
  const needle = `](${slug}.md)`;
  const kept = readFileSync(indexPath, "utf8").split("\n").filter((l) => !l.includes(needle));
  writeAtomic(indexPath, kept.join("\n").replace(/\n*$/, "\n"));
}

/**
 * File-based agent memory: a single `<home>/memory/MEMORY.md` index + per-
 * scenario `<slug>.md` files. The index is injected into systemPrompt.append;
 * scenario bodies are read on demand by the agent. Writes are serialized per
 * agent and atomic. No semantic retrieval (non-RAG — spec).
 */
export class AgentMemoryStore {
  private locks = new Map<string, Promise<unknown>>();

  constructor(private agents: Pick<AgentWorkspaceService, "homeDir">) {}

  private dir(agentId: string): string | null {
    const home = this.agents.homeDir(agentId);
    return home ? join(home, MEMORY_DIR) : null;
  }

  /** Create memory/ + an index file. Idempotent. Returns the dir or null. */
  ensure(agentId: string): string | null {
    const dir = this.dir(agentId);
    if (!dir) return null;
    mkdirSync(dir, { recursive: true });
    const idx = join(dir, MEMORY_INDEX);
    if (!existsSync(idx)) writeAtomic(idx, INDEX_HEADER);
    return dir;
  }

  /** Index text for injection ("" when none). */
  indexText(agentId: string): string {
    const dir = this.dir(agentId);
    if (!dir) return "";
    try {
      return readFileSync(join(dir, MEMORY_INDEX), "utf8");
    } catch {
      return "";
    }
  }

  async tree(agentId: string): Promise<TreeNode[]> {
    const dir = this.dir(agentId);
    if (!dir) return [];
    mkdirSync(dir, { recursive: true });
    return walkTree(dir, "", 0, { count: 0 });
  }

  save(agentId: string, input: MemorySaveInput): Promise<MemoryEditResult> {
    return this.locked(agentId, () => {
      const dir = this.ensure(agentId);
      if (!dir) return { status: "not_found" as const };
      const slug = sanitizeSlug(input.file);
      const body = input.content.endsWith("\n") ? input.content : `${input.content}\n`;
      writeAtomic(join(dir, `${slug}.md`), body);
      upsertIndexLine(join(dir, MEMORY_INDEX), slug, input.title, input.hook);
      return { status: "ok" as const, message: input.title };
    });
  }

  remove(agentId: string, file: string): Promise<MemoryEditResult> {
    return this.locked(agentId, () => {
      const dir = this.dir(agentId);
      if (!dir) return { status: "not_found" as const };
      const slug = sanitizeSlug(file);
      const fp = join(dir, `${slug}.md`);
      if (!existsSync(fp)) return { status: "not_found" as const };
      rmSync(fp);
      removeIndexLine(join(dir, MEMORY_INDEX), slug);
      return { status: "ok" as const, message: slug };
    });
  }

  /** Backstop: past `hard`, drop oldest index entries (+ their files) until the
   *  index char length ≤ `soft`. Oldest = first matching line top-down. */
  enforceIndexBudget(agentId: string): Promise<void> {
    return this.locked(agentId, () => {
      const dir = this.dir(agentId);
      if (!dir) return;
      const idxPath = join(dir, MEMORY_INDEX);
      if (!existsSync(idxPath)) return;
      while (readFileSync(idxPath, "utf8").length > MEMORY_INDEX_BUDGET.hard) {
        const lines = readFileSync(idxPath, "utf8").split("\n");
        const i = lines.findIndex((l) => /\]\(([\w.-]+)\.md\)/.test(l));
        if (i < 0) break;
        const slug = lines[i]!.match(/\]\(([\w.-]+)\.md\)/)![1]!;
        rmSync(join(dir, `${slug}.md`), { force: true });
        lines.splice(i, 1);
        writeAtomic(idxPath, lines.join("\n").replace(/\n*$/, "\n"));
        if (readFileSync(idxPath, "utf8").length <= MEMORY_INDEX_BUDGET.soft) break;
      }
    });
  }

  private async locked<T>(agentId: string, fn: () => T): Promise<T> {
    const prev = this.locks.get(agentId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(agentId, run.catch(() => {}));
    return run;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test src/services/agentMemoryStore.test.ts`
Expected: PASS（7 tests）。

- [ ] **Step 5: 提交**

```bash
cd /Users/yangjie.ugreen/ugreen/ugreen-ai/agent-works
git add sidecar/src/services/agentMemoryStore.ts sidecar/src/services/agentMemoryStore.test.ts
git commit -m "feat(memory): file-based AgentMemoryStore (MEMORY.md index + scenario files)"
```

---

## Task 2: 创建智能体时 seed memory/MEMORY.md

**Files:**
- Modify: `sidecar/src/services/agentWorkspaces.ts`（`create()`，约 71-75 行）
- Test: `sidecar/src/services/agentWorkspaces.test.ts`（已存在，追加一例）

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 agentWorkspaces.test.ts 已有 describe 内
test("create seeds <home>/memory/MEMORY.md", () => {
  const agent = service.create({ name: "Jay" });
  expect(existsSync(join(agent.homeDir, "memory", "MEMORY.md"))).toBe(true);
});
```
（确保文件顶部已 `import { existsSync } from "node:fs"` 与 `join`；缺则补。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test src/services/agentWorkspaces.test.ts -t "seeds"`
Expected: FAIL（`MEMORY.md` 不存在）。

- [ ] **Step 3: 在 create() 里 seed**

在 `mkdirSync(homeDir, { recursive: true });` 之后插入：

```ts
// Seed the file-based memory store so the index file always exists.
const memDir = join(homeDir, "memory");
mkdirSync(memDir, { recursive: true });
const memIndex = join(memDir, "MEMORY.md");
if (!existsSync(memIndex)) {
  writeFileSync(
    memIndex,
    "# Memory index\n\n<!-- One line per scenario memory: - [Title](slug.md) — hook. -->\n\n",
    "utf8",
  );
}
```
文件顶部 import 补 `existsSync`、`writeFileSync`（已 import `mkdirSync`，`join`）。

> 注：seed 内容与 `agentMemoryStore.INDEX_HEADER` 等价；二者皆 idempotent，`ensure()` 不会覆盖既有文件，无冲突。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd sidecar && bun test src/services/agentWorkspaces.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add sidecar/src/services/agentWorkspaces.ts sidecar/src/services/agentWorkspaces.test.ts
git commit -m "feat(memory): seed <home>/memory/MEMORY.md on agent creation"
```

---

## Task 3: 重写 remember 工具 + onRemember 接到 store

**Files:**
- Modify: `sidecar/src/agui/provider-claude/remember-tool.ts`
- Modify: `sidecar/src/agui/provider-claude/remember-tool.test.ts`
- Modify: `sidecar/src/server.ts`（onRemember + wire store）

- [ ] **Step 1: 改测试（先定义新契约）**

把 `remember-tool.test.ts` 内对 `block`/`add|replace|remove` 的断言改为新形态：

```ts
import { describe, expect, test } from "bun:test";
import { validateMemoryEditArgs, resultToText } from "./remember-tool";

describe("validateMemoryEditArgs", () => {
  test("save requires file/title/hook/content", () => {
    expect(validateMemoryEditArgs({ action: "save" })).toBeTruthy();
    expect(validateMemoryEditArgs({ action: "save", file: "p", title: "P", hook: "h", content: "c" })).toBeNull();
  });
  test("remove requires file", () => {
    expect(validateMemoryEditArgs({ action: "remove" })).toBeTruthy();
    expect(validateMemoryEditArgs({ action: "remove", file: "p" })).toBeNull();
  });
});

describe("resultToText", () => {
  test("ok save / remove", () => {
    expect(resultToText({ action: "save", file: "p", title: "P", hook: "h", content: "c" }, { status: "ok", message: "P" })).toContain("Saved");
    expect(resultToText({ action: "remove", file: "p" }, { status: "ok", message: "p" })).toContain("Removed");
  });
  test("not_found", () => {
    expect(resultToText({ action: "remove", file: "p" }, { status: "not_found" })).toContain("No memory");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test src/agui/provider-claude/remember-tool.test.ts`
Expected: FAIL（签名/类型不匹配）。

- [ ] **Step 3: 重写 remember-tool.ts**

```ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MemoryEditResult } from "../../services/agentMemoryStore";

export const REMEMBER_TOOL_FQN = "mcp__agent_studio__remember";

export type MemoryEdit =
  | { action: "save"; file: string; title: string; hook: string; content: string }
  | { action: "remove"; file: string };

export type RememberFn = (
  edit: MemoryEdit,
  ctx: { agentWorkspaceId: string; threadId: string },
) => MemoryEditResult | Promise<MemoryEditResult>;

/** Returns an error string for the model, or null when args are usable. Pure. */
export function validateMemoryEditArgs(args: {
  action: "save" | "remove";
  file?: string;
  title?: string;
  hook?: string;
  content?: string;
}): string | null {
  if (!args.file?.trim()) return "`file` (the scenario slug) is required.";
  if (args.action === "save") {
    if (!args.title?.trim()) return "`title` is required for save.";
    if (!args.hook?.trim()) return "`hook` is required for save.";
    if (!args.content?.trim()) return "`content` is required for save.";
  }
  return null;
}

/** Model-facing text. Pure. */
export function resultToText(edit: MemoryEdit, result: MemoryEditResult): string {
  if (result.status === "not_found") {
    return `No memory file "${edit.file}" found. List the memory index first; use an existing slug to edit, or a new slug to create.`;
  }
  return edit.action === "save"
    ? `Saved memory "${result.message}" → ${edit.file}.md (indexed in MEMORY.md).`
    : `Removed memory ${edit.file}.md from MEMORY.md.`;
}

/**
 * `remember` tool for the in-process `agent_studio` MCP server. The agent manages
 * its own memory as markdown files under <home>/memory/: a MEMORY.md index +
 * per-scenario <slug>.md files. The index is in your context — consult it first.
 *   - save:   write a scenario file + upsert its index line. To extend an existing
 *             scenario, Read its file, merge, and save the FULL content under the
 *             same `file`; for a new scenario pick a new `file` slug.
 *   - remove: delete a scenario file + its index line.
 * Exposed ONLY on agent-bound runs; FQN must also be in allowedTools.
 */
export function buildRememberTool(deps: {
  agentWorkspaceId: string;
  threadId: string;
  onRemember: RememberFn;
}) {
  return tool(
    "remember",
    "Manage durable memory for THIS agent as markdown files: a MEMORY.md index " +
      "(in your context) + per-scenario <slug>.md files. action='save' writes a " +
      "scenario file and upserts its index line; to add to an existing scenario, " +
      "Read that file, merge, and save the full content under the same `file`; " +
      "use a new `file` slug for a new scenario. action='remove' deletes a scenario " +
      "file + its index line. Save sparingly — durable facts worth recalling in " +
      "future sessions, not transient task details.",
    {
      action: z.enum(["save", "remove"]).describe("save a scenario memory file, or remove one."),
      file: z.string().describe("scenario slug (kebab-case, no extension), e.g. 'user-profile'."),
      title: z.string().optional().describe("save: human title shown in the index link."),
      hook: z.string().optional().describe("save: one-line hook in the index — what this memory is about (used for recall)."),
      content: z.string().optional().describe("save: the FULL markdown body of the scenario file."),
    },
    async (args): Promise<{ content: { type: "text"; text: string }[] }> => {
      const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
      const invalid = validateMemoryEditArgs(args);
      if (invalid) return text(invalid);
      const edit: MemoryEdit =
        args.action === "save"
          ? { action: "save", file: args.file, title: args.title!, hook: args.hook!, content: args.content! }
          : { action: "remove", file: args.file };
      const result = await deps.onRemember(edit, {
        agentWorkspaceId: deps.agentWorkspaceId,
        threadId: deps.threadId,
      });
      return text(resultToText(edit, result));
    },
    { annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  );
}
```

- [ ] **Step 4: 改 server.ts onRemember + wire store**

在 `server.ts`：
1. import：`import { AgentMemoryStore } from "./services/agentMemoryStore";`（删 `AgentMemoryService` import 留到 Task 7）。
2. 实例化（约 99 行 `const agentMemories = ...` 旁）：`const agentMemoryStore = new AgentMemoryStore(agentWorkspaces);`
3. onRemember（205-224 行）整段替换为：

```ts
    onRemember: (edit, { agentWorkspaceId }) => {
      if (edit.action === "save") {
        return agentMemoryStore.save(agentWorkspaceId, {
          file: edit.file, title: edit.title, hook: edit.hook, content: edit.content,
        });
      }
      return agentMemoryStore.remove(agentWorkspaceId, edit.file);
    },
```

> `agentMemories`（旧 service）+ `buildAgentMemoryRoutes` 挂载暂时保留，Task 7 统一删除（保持本次提交可编译）。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd sidecar && bun test src/agui/provider-claude/remember-tool.test.ts && bunx tsc --noEmit`
Expected: tool 测试 PASS；tsc 仅余既有无关报错（`fileContent.test.ts`/`settings.test.ts`）。

- [ ] **Step 6: 提交**

```bash
git add sidecar/src/agui/provider-claude/remember-tool.ts sidecar/src/agui/provider-claude/remember-tool.test.ts sidecar/src/server.ts
git commit -m "feat(memory): remember tool writes files + maintains index (drop block)"
```

---

## Task 4: runWorker 注入改为 CLAUDE.md + 索引

**Files:**
- Modify: `sidecar/src/agent/runWorker.ts`（`buildAgentAppendContext` 44-72；memory 块 245-272；`RunWorkerInput` 74-104；解构）
- Modify: `sidecar/src/agent/runWorker.test.ts`
- Modify: `sidecar/src/routes/runs.ts`（两处 runWorker 调用：传 `agentMemoryStore`）
- Modify: `sidecar/src/server.ts`（route deps 传 `agentMemoryStore`）

- [ ] **Step 1: 改 buildAgentAppendContext 测试**

把 `runWorker.test.ts` 中对 `buildAgentAppendContext` 的用例改为新签名：

```ts
import { buildAgentAppendContext } from "./runWorker";

test("buildAgentAppendContext: CLAUDE.md + memory index", () => {
  const out = buildAgentAppendContext("Be terse.", "- [User](user.md) — Jay");
  expect(out).toContain("Be terse.");
  expect(out).toContain("## Memory index");
  expect(out).toContain("- [User](user.md) — Jay");
});
test("buildAgentAppendContext: null when both empty", () => {
  expect(buildAgentAppendContext(null, "")).toBeNull();
});
test("buildAgentAppendContext: nudge near budget", () => {
  const big = "- x\n".repeat(500); // > warn
  expect(buildAgentAppendContext(null, big)).toContain("consolidate");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test src/agent/runWorker.test.ts -t "buildAgentAppendContext"`
Expected: FAIL（签名不符）。

- [ ] **Step 3: 重写 buildAgentAppendContext**（44-72 行整段替换）

```ts
import { MEMORY_INDEX_BUDGET } from "../services/agentMemoryStore";

/**
 * Agent context injected into systemPrompt.append on agent-bound runs: the
 * agent's <home>/CLAUDE.md instructions (verbatim) + its memory index
 * (<home>/memory/MEMORY.md). Scenario file bodies are NOT injected — the agent
 * Reads them on demand. Near the index budget, append a consolidation nudge.
 * Pure (IO is the caller's). Returns null when both are empty.
 */
export function buildAgentAppendContext(
  claudeMd: string | null,
  memoryIndex: string,
): string | null {
  const parts: string[] = [];
  const md = claudeMd?.trim();
  if (md) parts.push(md);
  const idx = memoryIndex.trim();
  if (idx) {
    const nudge =
      memoryIndex.length >= MEMORY_INDEX_BUDGET.warn
        ? "\n\n<!-- Memory index near capacity — consolidate: merge or remove stale scenario files via the remember tool. -->"
        : "";
    parts.push(`## Memory index\n${idx}${nudge}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}
```
（删除文件顶部 `BLOCK_SECTIONS` 常量、`MemoryBlock`/`BlockBudget`/`MEMORY_BUDGETS` 的 import —— 改 import `MEMORY_INDEX_BUDGET`。）

- [ ] **Step 4: 改 memory 块（245-272 行）**

```ts
  let appendContext: string | undefined;
  if (agentWorkspaceId) {
    let claudeMd: string | null = null;
    try {
      claudeMd = readFileSync(join(cwd, "CLAUDE.md"), "utf8");
    } catch {
      // No CLAUDE.md → no instructions section.
    }
    let memoryIndex = "";
    if (agentMemoryStore) {
      await agentMemoryStore.enforceIndexBudget(agentWorkspaceId); // host backstop
      memoryIndex = agentMemoryStore.indexText(agentWorkspaceId);
    }
    appendContext = buildAgentAppendContext(claudeMd, memoryIndex) ?? undefined;
  }
```

- [ ] **Step 5: 改 RunWorkerInput + 解构**

- `RunWorkerInput`：把 `agentMemories?: AgentMemoryService;` 改为
  `agentMemoryStore?: AgentMemoryStore;`（import 改为 `import type { AgentMemoryStore } from "../services/agentMemoryStore";`）。
- 解构块（107-126）：`agentMemories,` → `agentMemoryStore,`。

- [ ] **Step 6: 改 routes/runs.ts 两处 runWorker 调用**

把两处 `agentMemories: deps.agentMemories,` 改为 `agentMemoryStore: deps.agentMemoryStore,`。
（`RunRoutesDeps` 里相应把 `agentMemories` 字段改名 `agentMemoryStore`，类型 `AgentMemoryStore`。）

- [ ] **Step 7: 改 server.ts route deps**

`buildRunRoutes({ ... })` 的 deps 里 `agentMemories,` → `agentMemoryStore,`。

- [ ] **Step 8: 跑测试 + tsc**

Run: `cd sidecar && bun test src/agent/runWorker.test.ts && bunx tsc --noEmit`
Expected: runWorker 测试 PASS；tsc 仅余既有无关报错。

- [ ] **Step 9: 提交**

```bash
git add sidecar/src/agent/runWorker.ts sidecar/src/agent/runWorker.test.ts sidecar/src/routes/runs.ts sidecar/src/server.ts
git commit -m "feat(memory): inject CLAUDE.md + memory index, drop block injection"
```

---

## Task 5: 记忆文件树路由 GET /agents/:id/memory/tree

**Files:**
- Create: `sidecar/src/routes/agentMemory.ts`
- Create: `sidecar/src/routes/agentMemory.test.ts`
- Modify: `sidecar/src/server.ts`（挂载新路由）

- [ ] **Step 1: 写失败测试**

```ts
// sidecar/src/routes/agentMemory.test.ts
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { AgentWorkspaceService } from "../services/agentWorkspaces";
import { AgentMemoryStore } from "../services/agentMemoryStore";
import { buildAgentMemoryTreeRoutes } from "./agentMemory";

function setup() {
  const db = new Database(":memory:");
  migrate(db);
  const base = mkdtempSync(join(tmpdir(), "agm-rt-"));
  const agents = new AgentWorkspaceService(db, { baseDir: base });
  const store = new AgentMemoryStore(agents);
  const app = new Hono();
  app.route("/", buildAgentMemoryTreeRoutes({ agentMemoryStore: store, agentWorkspaces: agents }));
  return { app, agents, store };
}

describe("GET /agents/:id/memory/tree", () => {
  it("returns the memory file tree", async () => {
    const { app, agents, store } = setup();
    const a = agents.create({ name: "A" });
    await store.save(a.id, { file: "p", title: "P", hook: "h", content: "x" });
    const res = await app.request(`/agents/${a.id}/memory/tree`);
    expect(res.status).toBe(200);
    const names = (await res.json()).map((n: { name: string }) => n.name).sort();
    expect(names).toEqual(["MEMORY.md", "p.md"]);
  });
  it("404s for unknown agent", async () => {
    const { app } = setup();
    expect((await app.request(`/agents/nope/memory/tree`)).status).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd sidecar && bun test src/routes/agentMemory.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现路由**

```ts
// sidecar/src/routes/agentMemory.ts
import { Hono } from "hono";
import type { AgentMemoryStore } from "../services/agentMemoryStore";
import type { AgentWorkspaceService } from "../services/agentWorkspaces";

export interface MountAgentMemoryTreeDeps {
  agentMemoryStore: AgentMemoryStore;
  agentWorkspaces: AgentWorkspaceService;
}

/** Read-only file tree of <home>/memory/. Agent writes arrive via the remember
 *  tool, not here; users cannot edit memory files. */
export function buildAgentMemoryTreeRoutes(deps: MountAgentMemoryTreeDeps): Hono {
  const app = new Hono();
  app.get("/agents/:id/memory/tree", async (c) => {
    const id = c.req.param("id");
    if (!deps.agentWorkspaces.get(id)) return c.json({ error: "agent_not_found" }, 404);
    return c.json(await deps.agentMemoryStore.tree(id));
  });
  return app;
}
```

- [ ] **Step 4: 挂载（server.ts）**

import + 在挂载段（274 行附近）加：
```ts
import { buildAgentMemoryTreeRoutes } from "./routes/agentMemory";
// ...
app.route("/", buildAgentMemoryTreeRoutes({ agentMemoryStore, agentWorkspaces }));
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd sidecar && bun test src/routes/agentMemory.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add sidecar/src/routes/agentMemory.ts sidecar/src/routes/agentMemory.test.ts sidecar/src/server.ts
git commit -m "feat(memory): GET /agents/:id/memory/tree (read-only file tree)"
```

---

## Task 6: 删除旧行模型（service / 路由 / 表）

**Files:**
- Delete: `sidecar/src/services/agentMemories.ts`、`sidecar/src/services/agentMemories.test.ts`
- Delete: `sidecar/src/routes/agentMemories.ts`、`sidecar/src/routes/agentMemories.test.ts`
- Modify: `sidecar/src/server.ts`、`sidecar/src/db.ts`

- [ ] **Step 1: 删除文件 + 解除引用**

```bash
cd sidecar
git rm src/services/agentMemories.ts src/services/agentMemories.test.ts src/routes/agentMemories.ts src/routes/agentMemories.test.ts
```
`server.ts`：删 `import { AgentMemoryService }`、`import { buildAgentMemoryRoutes }`、`const agentMemories = new AgentMemoryService(db);`、`app.route("/", buildAgentMemoryRoutes({...}));`，以及 deps 对象里残留的 `agentMemories,`（grep 确保无剩余引用）。

- [ ] **Step 2: db.ts 删表**

删除 `CREATE TABLE ... agent_memories (...)` 整段 + `CREATE INDEX ... idx_agent_memories_agent` + `ensureColumn(db, "agent_memories", "block", ...)`（235 行）。

> 预发布、不迁移；既有库里的 `agent_memories` 表留着无害（不再被读写），新库不再建。

- [ ] **Step 3: 全量验证**

Run: `cd sidecar && bunx tsc --noEmit && bun test`
Expected: tsc 仅余既有 `fileContent.test.ts`/`settings.test.ts` 报错；`bun test` 无新增失败（旧 memory 测试已随文件删除）。

- [ ] **Step 4: 提交**

```bash
git add -A sidecar
git commit -m "refactor(memory): remove row-model agent_memories service/routes/table"
```

---

## Task 7: 前端记忆树数据层

**Files:**
- Create: `src/lib/data/agent-memory-tree.ts`
- Create: `src/lib/data/agent-memory-tree-queries.ts`

- [ ] **Step 1: client（仿 `agent-folders.ts` 的 `getAgentFolderTree`）**

```ts
// src/lib/data/agent-memory-tree.ts
import { authedFetch } from "@/lib/sidecar-client";

export interface MemoryTreeNode {
  path: string;
  name: string;
  kind: "file" | "dir";
  children?: MemoryTreeNode[];
}

export async function getAgentMemoryTree(agentId: string): Promise<MemoryTreeNode[]> {
  const res = await authedFetch(`/agents/${agentId}/memory/tree`);
  if (!res.ok) throw new Error(`GET memory tree failed: ${res.status}`);
  return (await res.json()) as MemoryTreeNode[];
}
```

- [ ] **Step 2: query hook（仿 `agent-folder-queries.ts`）**

```ts
// src/lib/data/agent-memory-tree-queries.ts
import { useQuery } from "@tanstack/react-query";
import { getAgentMemoryTree } from "./agent-memory-tree";

export const agentMemoryKeys = {
  tree: (agentId: string) => ["agents", "detail", agentId, "memory-tree"] as const,
};

export function useAgentMemoryTree(agentId: string | null, enabled = true) {
  return useQuery({
    queryKey: agentMemoryKeys.tree(agentId ?? "__none__"),
    queryFn: () => getAgentMemoryTree(agentId!),
    enabled: !!agentId && enabled,
    staleTime: 5_000,
  });
}
```

- [ ] **Step 3: typecheck + 提交**

Run: `bunx tsc --noEmit -p tsconfig.app.json`
Expected: 通过（除既有 `.stories.tsx` 报错）。

```bash
git add src/lib/data/agent-memory-tree.ts src/lib/data/agent-memory-tree-queries.ts
git commit -m "feat(memory): frontend memory-tree data layer"
```

---

## Task 8: MemoryFilesCard（只读文件树）+ ContextCard 接入

**Files:**
- Create: `src/features/agent-workspaces/MemoryFilesCard.tsx`
- Modify: `src/features/agent-workspaces/ContextCard.tsx`
- Delete: `src/features/agent-workspaces/MemoryCard.tsx`
- Delete: `src/lib/data/agent-memories.ts`、`src/lib/data/agent-memory-queries.ts`
- Modify: `src/lib/data/types.ts`（删 `MemoryBlock`/`AgentMemory`）

- [ ] **Step 1: MemoryFilesCard（复用 FileTree + 现有 fileTypeFromName 模式）**

```tsx
// src/features/agent-workspaces/MemoryFilesCard.tsx
import { useMemo } from "react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { useTranslation } from "react-i18next";
import { useAgentWorkspace } from "@/lib/data/agent-queries";
import { useAgentMemoryTree } from "@/lib/data/agent-memory-tree-queries";
import type { MemoryTreeNode } from "@/lib/data/agent-memory-tree";
import type { MockFile } from "@/lib/mock/types";
import type { OpenFolderFile } from "./AgentFoldersCard";

function typeFromName(name: string): MockFile["type"] {
  if (name.endsWith(".md")) return "markdown";
  return "text";
}

function collectFilePaths(nodes: MemoryTreeNode[], acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.kind === "file") acc.add(n.path);
    else if (n.children) collectFilePaths(n.children, acc);
  }
  return acc;
}

function renderNodes(nodes: MemoryTreeNode[]) {
  return nodes.map((n) =>
    n.kind === "dir" ? (
      <FileTreeFolder key={n.path} path={n.path} name={n.name}>
        {n.children ? renderNodes(n.children) : null}
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={n.path} path={n.path} name={n.name} />
    ),
  );
}

/** Read-only file tree of the agent's <home>/memory/. Clicking a file opens the
 *  PreviewPane (read-only). Memory is agent-written; users cannot edit it here. */
export function MemoryFilesCard({
  agentId,
  onOpenFile,
}: {
  agentId: string;
  onOpenFile?: OpenFolderFile;
}) {
  const { t } = useTranslation();
  const { data: agent } = useAgentWorkspace(agentId);
  const { data: tree } = useAgentMemoryTree(agentId);
  const nodes = tree ?? [];
  const filePaths = useMemo(() => collectFilePaths(nodes), [nodes]);
  // memory dir = <home>/memory; preview sandbox uses it as workingDir.
  const memoryDir = agent ? `${agent.homeDir}/memory` : "";

  const handleSelect = (relPath: string, name: string) => {
    if (!onOpenFile || !filePaths.has(relPath) || !memoryDir) return;
    onOpenFile(
      { name, path: `${memoryDir}/${relPath}`, type: typeFromName(name) } as MockFile,
      memoryDir,
    );
  };

  if (nodes.length === 0) {
    return <p className="px-1.5 text-xs italic text-muted-foreground">{t("agentSpace.memory.empty")}</p>;
  }
  return <FileTree onSelect={handleSelect}>{renderNodes(nodes)}</FileTree>;
}
```

> 注：确认 `FileTree onSelect` 回调签名 = `(path, name)`（与 AgentFoldersCard 的 `handleSelect` 一致）。若实际签名不同，对齐 AgentFoldersCard 的用法即可。`MockFile.type` 取值以 `@/lib/mock/types` 实际枚举为准（markdown/text）。

- [ ] **Step 2: ContextCard 换卡**

`ContextCard.tsx`：
- `import { MemoryCard } from "./MemoryCard";` → `import { MemoryFilesCard } from "./MemoryFilesCard";`
- `<MemoryCard agentId={agentId} />` → `<MemoryFilesCard agentId={agentId} onOpenFile={onOpenFile} />`
（`ContextCard` 已有 `onOpenFile` 透传，沿用。）

- [ ] **Step 3: 删旧件 + 类型**

```bash
git rm src/features/agent-workspaces/MemoryCard.tsx src/lib/data/agent-memories.ts src/lib/data/agent-memory-queries.ts
```
`types.ts`：删 `MemoryBlock`、`AgentMemory`（grep 确认无残留引用：`grep -rn "MemoryBlock\|AgentMemory\b\|agent-memory-queries\|agent-memories\"" src`）。

- [ ] **Step 4: typecheck + build**

Run: `bunx tsc --noEmit -p tsconfig.app.json && bunx vite build`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add -A src
git commit -m "feat(memory): read-only MemoryFilesCard (file tree → preview), drop MemoryCard"
```

---

## Task 9: i18n

**Files:**
- Modify: `src/i18n/locales/zh/agentSpace.json`、`src/i18n/locales/en/agentSpace.json`

- [ ] **Step 1: 改键**

`memory` 命名空间：删 `blockProfile/blockFacts/add/addTitle/addPlaceholder/edit/cancel/remove/emptyHint`；保留 `title`；新增 `empty`。
- zh：`"empty": "暂无记忆"`
- en：`"empty": "No memories yet"`

- [ ] **Step 2: 验证无缺键**

Run: `bunx tsc --noEmit -p tsconfig.app.json && bunx vite build`
Expected: 通过（grep 确认 `MemoryFilesCard`/`ContextCard` 用到的 `agentSpace.memory.*` 键都存在）。

- [ ] **Step 3: 提交**

```bash
git add src/i18n/locales/zh/agentSpace.json src/i18n/locales/en/agentSpace.json
git commit -m "chore(i18n): memory keys for file-based memory card"
```

---

## Task 10: 终检

- [ ] **Step 1: 后端全量**

Run: `cd sidecar && bunx tsc --noEmit && bun test`
Expected: tsc 仅余既有 `fileContent.test.ts`/`settings.test.ts` 报错；`bun test` 0 新增失败。

- [ ] **Step 2: 前端全量**

Run: `bunx tsc --noEmit -p tsconfig.app.json && bunx vite build && bun test src/`
Expected: tsc 仅余既有 `.stories.tsx` 报错；build ✓；前端测试 0 新增失败。

- [ ] **Step 3: 手验（可选，tauri:dev）**

新建 agent → 对话里说"记住我叫 Jay 前端工程师" → Context → Memory 出现 `MEMORY.md` + `user-profile.md`（或 agent 选的 slug），点开 PreviewPane 只读可见；MEMORY.md 含一行索引。新开对话问"我叫什么"→ agent 能从索引/读文件答出。

- [ ] **Step 4: 最终 review**

按 superpowers:requesting-code-review 对整条分支做一次审查（design-tokens 无硬编码、反 AI slop、lucide 图标；记忆文件确为只读;`说明` 编辑未受影响）。

---

## Self-Review（写计划后自查）

- **Spec coverage**：§3 存储模型→T1/T2；§4 注入→T4；§5 工具→T3；§6 并发→T1（lock+原子写）；§7 后端清单→T1-6；§8 前端清单→T7-9；§9 测试→各任务 + T10。全覆盖。
- **类型一致**：`MemoryEditResult`（store 导出）贯穿 store/tool/server；`MemoryEdit` 联合类型在 tool 内自洽；`RememberFn` 签名 store↔tool↔server 对齐；`agentMemoryStore` 字段名在 RunWorkerInput/runs.ts deps/server.ts 三处一致改名。
- **占位扫描**：无 TBD；唯二"以实际为准"标注（`FileTree onSelect` 签名、`MockFile.type` 枚举）已指向权威来源（AgentFoldersCard / `@/lib/mock/types`），实施时一眼可定。
- **可编译性**：每个 Task 末提交点都保持 tsc 绿（旧 `agentMemories` service/routes 留到 T6 才删，期间无悬空引用）。
