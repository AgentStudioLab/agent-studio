# Customize → Skills 实装设计

> 把 `src/features/customize/SkillsBody.tsx` 从 mock 形态接到真实数据：sidecar 扫描三个来源、SQLite 持久化 enable 状态、SDK 通过 `plugins` + `skills` 选项让 toggle 真生效。同时把默认工作空间路径从 `~/.agent-studio/` 调整为 `~/.agent-studio/workspace/`，并新增 `~/.agent-studio/skills/` 作为第三个 skill 来源。

**Goal:** 让 Customize > Skills 页面接通真实 skill 数据，toggle 真的影响下一次 agent run。

**主流参考:** Anthropic Cowork 的 "Customize > Skills" 体验 + Anthropic Agent Skills 开放标准。我们的方案是 Cowork 的单机精简版，机制完全一致。

**Tech Stack:** Bun + Hono + Claude Agent SDK（sidecar）、SQLite、React 19 + TanStack Query（前端）、Tauri v2 resources（built-in 打包）。

---

## 1. 架构与数据流

```
                          ┌────────────────────────────────────────┐
                          │ ~/.agent-studio/skills/<name>/SKILL.md │  Personal（Studio）
                          ├────────────────────────────────────────┤
                          │ ~/.claude/skills/<name>/SKILL.md       │  Personal（Claude）
                          ├────────────────────────────────────────┤
                          │ $RESOURCES/built-in/skills/<name>/...  │  Built-in
                          └────────────────────────────────────────┘
                                          │ scan on startup
                                          ▼
┌─────────────┐  GET /skills        ┌───────────────────────┐
│ React UI    │ ◀─────────────────  │ Sidecar               │
│ SkillsBody  │                     │   skillRegistry       │
│             │  PATCH /skills/     │   skill_state (SQLite)│
└─────────────┘ ──────────────────▶ └───────────────────────┘
                  :id/enabled                  │
                                               │ on every runTurn
                                               ▼
                                       sdkQuery({
                                         plugins: [{ type:"local", path: builtinDir }],
                                         skills: [...enabledIds],
                                         ...
                                       })
```

**核心组件**：

| 组件 | 职责 |
|---|---|
| `sidecar/src/services/skillRegistry.ts` | 启动时扫 3 个目录、解析 SKILL.md frontmatter、合并 SQLite enable 状态、暴露 `listSkills` / `setEnabled` / `listEnabledIds` |
| `sidecar/src/db.ts` 新表 `skill_state` | 持久化每个 skill 的 enabled 状态（默认 enabled） |
| `sidecar/src/routes/skills.ts` | `GET /skills`、`PATCH /skills/:id/enabled` |
| `sidecar/src/agui/provider-claude/provider.ts` | 每次 `runTurn` 前从 registry 取 enabled IDs，传给 SDK `skills` 选项；plugin path 传给 `plugins` |
| `built-in/` 项目根目录 | Agent Studio ship 的 SDK plugin（含 `.claude-plugin/plugin.json` + `skills/`） |
| `src-tauri/tauri.conf.json` | `bundle.resources` 把 `built-in/` 打包进 .app |
| `src-tauri/src/lib.rs` | sidecar spawn 时通过 env `AGENT_STUDIO_BUILTIN_DIR` 传 resource 绝对路径 |
| `src/features/customize/SkillsBody.tsx` | 替换 mock 数据源，用 useQuery 接 `/skills`，toggle 走乐观更新 + `useMutation` |
| `src/lib/agui/react/useSkills.ts` | 新 hook，封装 useQuery + useMutation，供 SkillsBody 使用 |

---

## 2. Sidecar 端实现

### 2.1 默认工作空间路径调整

`sidecar/src/services/threads.ts` 把 `DEFAULT_WORKING_DIR` 从 `~/.agent-studio` 改成 `~/.agent-studio/workspace`：

```ts
const DEFAULT_WORKING_DIR = join(homedir(), ".agent-studio", "workspace");
```

`ensureDefaultDir()` 用 `mkdirSync(..., { recursive: true })` 同时创建父目录 `~/.agent-studio/`。

**兼容性说明**：仅当前 `tauri` 分支未发布的窗口期影响小。已显式赋 `working_dir` 的 thread 不受影响；`working_dir IS NULL` 的 thread 之前 fallback 到 `~/.agent-studio/`，现在 fallback 到 `~/.agent-studio/workspace/`，理论上"看不到"老文件，开发者自行手动迁移。不写自动迁移逻辑（YAGNI；user 当前是唯一用户）。

### 2.2 启动 sweep

sidecar 启动早期（在 server.ts 的 listen 之前）调用一次 `ensureAgentStudioHome()`：

```ts
function ensureAgentStudioHome(): void {
  mkdirSync(join(homedir(), ".agent-studio", "workspace"), { recursive: true });
  mkdirSync(join(homedir(), ".agent-studio", "skills"), { recursive: true });
}
```

副作用：`~/.agent-studio/skills/` 提前可见，用户知道把自己的 skill 放在哪。

### 2.3 SQLite 新表

`sidecar/src/db.ts` 追加：

```sql
CREATE TABLE IF NOT EXISTS skill_state (
  skill_id   TEXT PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
```

孤立 row（registry 里不存在的 skill_id）**不删**——保留用户意图，下次该 skill 重新出现时仍是 disabled 状态。listSkills 时做 LEFT JOIN，孤立 row 自然不会出现在结果里。

### 2.4 skillRegistry 接口

```ts
export interface SkillView {
  id: string;                      // personal: name；builtin: agent-studio:<name>
  name: string;                    // 来自 SKILL.md frontmatter
  description: string;             // 来自 SKILL.md frontmatter
  source: "personal" | "builtin";
  sourcePath: string;              // 来源目录绝对路径，UI 用作副标题
  enabled: boolean;                // 合并 SQLite 后的 effective 值
}

export interface SkillRegistry {
  /** 启动时调用，扫盘 + 解析。失败的 skill 跳过 + console.warn。 */
  init(): Promise<void>;
  /** 返回 effective 视图（合并 SQLite 状态）。 */
  listSkills(): SkillView[];
  /** 设置 enabled 状态。skill_id 不存在抛 404 类错。 */
  setEnabled(skillId: string, enabled: boolean): void;
  /** 给 provider 用：当前 enabled 的 skill ID 列表（已合并 SQLite）。 */
  listEnabledIds(): string[];
  /** 给 provider 用：built-in plugin 目录绝对路径（无 plugin.json 时返回 null）。 */
  builtinPluginPath(): string | null;
}
```

### 2.5 扫描逻辑

`scanSourceDir(dir, source)` 步骤：

1. 不存在 → 返回 `[]`（不报错）
2. `readdirSync` 拿子目录列表
3. 对每个子目录 `<name>`，读 `<name>/SKILL.md`
4. 解析 YAML frontmatter（用 `js-yaml`；frontmatter 在 `---` 分隔块内。sidecar 已有 `js-yaml` 依赖则直接用，否则 `bun add js-yaml @types/js-yaml` 加上——比手写 YAML 解析器更稳）
5. 校验 `frontmatter.name` 和 `frontmatter.description` 都是非空 string；缺失 → warn skip
6. ID 拼装：
   - source = personal → `id = frontmatter.name`
   - source = builtin → `id = "agent-studio:" + frontmatter.name`
7. 返回 `Omit<SkillView, "enabled">` 数组

**目录扫描顺序**（决定冲突时谁赢）：

```ts
const sources: Array<{ dir: string; source: "personal" | "builtin" }> = [
  { dir: join(homedir(), ".agent-studio", "skills"), source: "personal" },
  { dir: join(homedir(), ".claude", "skills"),       source: "personal" },
  { dir: builtinDir,                                 source: "builtin" },
];
```

合并时维护一个 `Map<id, entry>`：第一次出现的写入，重复 id 的 console.warn 并跳过。

### 2.6 Built-in plugin 路径解析

`builtinDir` 解析顺序（先命中先用）：

1. `process.env.AGENT_STUDIO_BUILTIN_DIR`（production 由 Rust shell 设置）
2. dev fallback：`path.resolve(import.meta.dir, "../../../built-in")`（sidecar 跑在仓库内时）

启动时 `statSync(builtinDir + "/.claude-plugin/plugin.json")`：
- 存在 → `builtinPluginPath()` 返回 `builtinDir`
- 缺失 → log warn + 返回 `null`；provider 此时把 `plugins: []` 传给 SDK（Personal skill 仍可用，不爆错）

### 2.7 路由

`sidecar/src/routes/skills.ts`：

```
GET   /skills              → 200 { skills: SkillView[] }
PATCH /skills/:id/enabled  body { enabled: boolean }
                           → 204 (success)
                           → 404 (id not in registry)
                           → 400 (body shape invalid)
```

注册到 Hono app 之前要走 bearer middleware（与已有路由一致）。

### 2.8 provider.ts 集成

`sidecar/src/agui/provider-claude/provider.ts` 在 `sdkQuery({ ... options })` 增加 2 个字段：

```ts
const enabledSkills = skillRegistry.listEnabledIds();
const pluginPath = skillRegistry.builtinPluginPath();

sdkQuery({
  prompt,
  options: {
    // ...已有
    skills: enabledSkills,
    ...(pluginPath ? { plugins: [{ type: "local", path: pluginPath }] } : {}),
  },
});
```

**边界规则**：
- 用户把所有 skill 都 toggle off → `skills: []`，符合 SDK 语义（Skill tool 仍可被模型调用但不预加载任何 skill）
- 永远不用 `skills: 'all'`，避免某天 SDK 改默认 discovery 行为带来惊喜
- pluginPath 为 null 时不传 `plugins` 字段（不要传 `[]`，确保和"不打包 built-in"两种情况兼容）

---

## 3. Tauri 端实现

### 3.1 bundle.resources

`src-tauri/tauri.conf.json` 的 `bundle` 节加：

```json
"resources": ["../built-in/**/*"]
```

打包后 `built-in/` 整树进入 `<app>/Contents/Resources/built-in/`（macOS）或对应 Windows 路径。

### 3.2 spawn sidecar 传 env

`src-tauri/src/lib.rs` 已有 sidecar spawn 段，追加 env 注入：

```rust
if let Ok(builtin_dir) = app.path().resolve("built-in", tauri::path::BaseDirectory::Resource) {
    if builtin_dir.is_dir() {
        cmd = cmd.env("AGENT_STUDIO_BUILTIN_DIR", builtin_dir);
    }
}
```

**dev/prod 行为差异**（这是关键点，曾经踩过坑）：

- **prod (`tauri build`)**：`bundle.resources` 把 `built-in/` 复制到 `.app/Contents/Resources/built-in/`，`resolve(...)` 返回真实路径，`is_dir()` 成立 → env 被设；sidecar 拿到 env → 直接用
- **dev (`tauri dev`)**：`resolve(...)` 返回 `src-tauri/target/.../Resources/built-in` 这种**理论路径**，但 dev 不会真的把文件拷过去（bundle.resources 只在 build 时生效），`is_dir()` 失败 → **env 不设**；sidecar 看到 env 为 undefined → fallback 到 `<repo>/built-in/`（基于 `import.meta.url` 向上找）

不能"env 设了就一定 silent fallback"——production 打包错误（资源没复制进去）必须暴露为 null 而不是悄悄走 dev 路径。`is_dir()` gate 是兼顾两端的关键。

### 3.3 capability

**不需要新加 capability**。Tauri 的 fs permissions（`fs:allow-resource-read-recursive` 等）是给**前端 JS 通过 `@tauri-apps/plugin-fs` 读文件**用的；sidecar 是 OS 子进程，用 Node `fs.readdirSync` 直接读文件路径，不经过 Tauri permission 层。OS 文件权限继承自 Tauri 主进程足够了。

---

## 4. Built-in plugin 模板

项目根 `built-in/` 初始结构：

```
built-in/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── (空，留待后续添加内置 skill)
```

`built-in/.claude-plugin/plugin.json`：

```json
{
  "name": "agent-studio",
  "version": "0.1.0",
  "description": "Agent Studio built-in skills"
}
```

**version 字段不能省**——marketplace 文档明确说不带 version 时每个 commit 都被当成新版本会触发缓存失效，生产 plugin 必须 pin。后续 ship 新内置 skill 时 bump version。

skills 子目录暂时为空，搭好脚手架即可。第一个内置 skill 由后续 commit 加入。

---

## 5. 前端实现

### 5.1 新 hook

`src/lib/agui/react/useSkills.ts`：

```ts
export interface SkillView { /* 与 sidecar 一致 */ }

export function useSkills(): {
  skills: SkillView[];
  isLoading: boolean;
  error: Error | null;
  setEnabled: (id: string, enabled: boolean) => void;
} {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: async (): Promise<{ skills: SkillView[] }> => {
      const r = await fetchSidecar("/skills");
      return r.json();
    },
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const r = await fetchSidecar(`/skills/${encodeURIComponent(id)}/enabled`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error(`PATCH /skills failed: ${r.status}`);
    },
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: ["skills"] });
      const prev = qc.getQueryData<{ skills: SkillView[] }>(["skills"]);
      if (prev) {
        qc.setQueryData(["skills"], {
          skills: prev.skills.map((s) => (s.id === id ? { ...s, enabled } : s)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["skills"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
  return {
    skills: data?.skills ?? [],
    isLoading,
    error: error as Error | null,
    setEnabled: (id, enabled) => mutation.mutate({ id, enabled }),
  };
}
```

### 5.2 SkillsBody 改造

`src/features/customize/SkillsBody.tsx` 改动要点：

- 删 `import { loadedSkills } from "@/lib/mock/skills"` 和 `import type { MockSkill } from "@/lib/mock/types"`
- 用 `useSkills()` 拿数据
- 把 `PERSONAL_SKILLS / BUILTIN_SKILLS` 切片改成 `skills.filter(s => s.source === "personal")` / `... === "builtin"`
- `activeSkillId` 默认值改成 personal 列表的第一个（无则 builtin 第一个）
- `enabled` 改成读 `activeSkill.enabled`，`onToggle` 改成 `setEnabled(activeSkill.id, ...)`
- SkillDetail 的 "Trigger" 字段保持现状（暂时全部 `t("customize.skills.triggerValue")`，未来想做 manual / auto 区分时再说）

### 5.3 SkillCard 加来源副标题

`src/features/customize/SkillCard.tsx` 接受新可选 prop `sourcePath?: string`，在 description 之上加一行 11px 的 dim text 显示来源。例如：

```
[FS] Filesystem
     ~/.agent-studio/skills          ← 新增这行
     本地文件读写
```

**显示规则**：仅 `source === "personal"` 的 skill 由 SkillsBody 把 `sourcePath` 传进 SkillCard（让用户区分 `~/.agent-studio/skills/` 和 `~/.claude/skills/`）。`source === "builtin"` 的 skill 不传 `sourcePath`（builtin 都来自同一个 agent-studio plugin，无歧义无需展示）。SkillCard 在 `sourcePath` 为 `undefined` 时不渲染那一行。

### 5.4 mock 文件状态

`src/lib/mock/skills.ts` 和 `src/lib/mock/types.ts` 里的 `MockSkill` **保留**——其它地方（如 sidebar `PinnedItem` 演示数据）可能还在用，但 `SkillsBody.tsx` 不再 import。`SkillsBody.stories.tsx` 暂时跳过/标 skip（替换 stories 数据源不在本 spec 范围；后续单独 PR 加 QueryClientProvider mock）。

### 5.5 i18n

`src/i18n/locales/{zh,en}/customize.ts` 已经有 `customize.skills.*`，沿用。`sourcePath` 在 SkillCard 上直接显示原始路径字符串（`~/.agent-studio/skills` 等），不做 i18n label 抽象——路径本身是英文 + 已经够清楚。

---

## 6. 测试策略

| 层 | 文件 | 测什么 |
|---|---|---|
| Sidecar 单元 | `sidecar/src/services/skillRegistry.test.ts` | `scanSourceDir` 解析 SKILL.md frontmatter、缺失字段 skip、目录不存在返回空、重复 id 第一次赢 + warn |
| Sidecar 单元 | `sidecar/src/services/skillRegistry.test.ts`（同文件） | listSkills 合并 SQLite enabled 状态、孤立 row 被忽略、setEnabled 插入/更新 |
| Sidecar 单元 | `sidecar/src/services/threads.test.ts`（如已存在则追加 case） | DEFAULT_WORKING_DIR 包含 "workspace"；ensureDefaultDir 创建嵌套目录成功 |
| Sidecar 路由 | `sidecar/src/routes/skills.test.ts` | GET 返回数组；PATCH 合法 200；PATCH 不存在的 id 404；PATCH 错误 body 400；不带 bearer token 401 |
| Sidecar 集成 | `sidecar/src/agui/provider-claude/provider.test.ts` | 验证 sdkQuery 调用 args 包含正确的 `skills` 数组（mock SDK）；pluginPath null 时不传 `plugins` |
| 前端 hook | （暂不加单元测试；通过 stories + e2e 覆盖） | — |
| 前端 stories | `SkillsBody.stories.tsx` | 至少一个 loading 状态、一个 empty 状态、一个混合 personal+builtin 状态 |

测试不追求覆盖率，覆盖以上**用户可见状态切换**即可。

---

## 7. 实施顺序与依赖图

```
A. 默认工作空间路径迁移 (DEFAULT_WORKING_DIR + ensureAgentStudioHome)
   │
   └─▶ B. db.ts 新表 skill_state
           │
           └─▶ C. skillRegistry 扫描 + 合并 + 测试
                   │
                   ├─▶ D. routes/skills.ts + 测试
                   │       │
                   │       └─▶ E. 前端 useSkills + SkillsBody 接通
                   │
                   └─▶ F. provider.ts 集成 skills + plugins
                           │
                           └─▶ G. Tauri resources + Rust env 注入 + capability
                                   │
                                   └─▶ H. built-in/ 脚手架（plugin.json）
                                           │
                                           └─▶ I. e2e 验证：dev 模式 + 打包模式
```

依赖关系说明：
- A→B：迁移路径要先于建表（否则可能在错误目录下建 sqlite，虽然实际 sqlite 路径独立但语义上 A 先于 B 更清晰）
- B→C→D→E 是后端到前端的常规链
- F 跟 D 不依赖；可以并行
- G、H 是 production 打包专用；dev 模式不需要 G/H 也能跑（fallback 路径已就位）
- I 是验收

---

## 8. 验收清单

1. `bun run dev` 起 sidecar，`curl -H "Authorization: Bearer <token>" http://127.0.0.1:<port>/skills` 返回 3 个来源合并后的 skill 列表
2. `~/.agent-studio/skills/` 和 `~/.agent-studio/workspace/` 自动创建
3. 前端 Customize > Skills 看到真实 skill；Personal section 同时显示 `~/.agent-studio/skills/` 和 `~/.claude/skills/` 来源；Built-in section 显示项目内的（脚手架阶段为空）
4. Toggle 一个 skill 关掉 → SQLite skill_state 写入 enabled=0 → 下一次 agent run 时 sidecar 日志显示 `skills: [...] (不含被关掉的 id)`
5. 重启 sidecar，toggle 状态从 SQLite 恢复
6. `bun run tauri:build` 后启动打包版，built-in plugin 路径正常解析（环境变量被 Rust 注入），plugin 跟 Personal skill 一起出现在 UI 上
7. 删一个 personal skill 目录、重启 sidecar → UI 上 skill 消失，但 SQLite 里旧 enabled 状态保留（再次添加同名 skill 时恢复显示，状态延续）

---

## 9. 已知不做的事 (YAGNI)

- 不做 fs watcher 监听 skill 目录变化 — 重启 sidecar 生效（Cowork 也是）
- 不做老 `~/.agent-studio/` 文件自动迁移到 `workspace/` — `tauri` 分支当前用户=自己
- 不做 skill ZIP 上传 / Create skill 向导 — 后续 phase
- 不做 plugin marketplace 接入 — 长期可能做，但不在本 spec 范围
- 不做 per-thread skill override — 全局 enable/disable 为唯一持久化状态
- 不做 skill 描述全文预览 — UI 只展示 frontmatter description；用户点"打开目录"可以走 `shell.open`（已有 capability）

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| Bun `--compile` 后 SDK plugin path 解析失败（issue #150 类似坑） | 不用 bun embed；built-in 走 Tauri resources，Rust 注入真实 fs 路径 |
| `~/.claude/skills/` 下用户的 skill 不符合 SKILL.md 规范（plugin 装的 skill 散落在 `~/.claude/plugins/...`） | 扫描时只处理子目录里的 `SKILL.md`，缺失/解析失败 warn skip，不爆炸 |
| 用户在两个 personal 目录里放了同名 skill | 第一个赢 + console.warn；前端可以后续加 "duplicate" 徽标，本 spec 暂不实现 |
| SDK 默认行为变更（discovery 改路径） | 始终传显式 `skills: [...]` 数组而非 `'all'`，把模糊面收窄 |
| `~/.agent-studio/skills/` 第一次启动不存在 | 启动 sweep `ensureAgentStudioHome` mkdir 出来 |
