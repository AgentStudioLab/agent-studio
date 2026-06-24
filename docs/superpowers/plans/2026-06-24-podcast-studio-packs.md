# 播客工作室智能体包 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在智能体广场中交付第一版播客音频生产 Agent Pack，包括 6 个官方播客包、pack 元数据、播客分类、卡片/详情增强、音频工具体检和测试覆盖。

**Architecture:** 继续沿用 `sidecar/src/builtins/agents/` 作为官方定义单一来源，`reconcileBuiltinAgents` 将基础定义和 `pack` 元数据同步到 SQLite。前端通过现有 `/agents` 数据流读取 `catalogMetadata`，在 `/agents` 与 `/agents/:id` 上做增强展示，sample task 只预填 composer，不改变 run 创建路径。

**Tech Stack:** Bun + Hono + SQLite sidecar，React 19 + TypeScript + Tailwind v4 + React Query 前端，测试统一使用 Bun runner。

---

## 文件结构

- Modify: `sidecar/src/db.ts`  
  增加 `agent_workspaces.catalog_json` schema 与迁移列。
- Modify: `sidecar/src/services/agentWorkspaces.ts`  
  增加 `podcast` 分类、`AgentCatalogMetadata` 类型、catalog JSON 解析与序列化。
- Modify: `sidecar/src/builtins/agents/index.ts`  
  扩展 `BuiltinAgentDef`，静态导入 6 个 podcast pack。
- Modify: `sidecar/src/services/builtinAgents.ts`  
  reconcile 时写入 `catalog_json`，缺省为 null。
- Create: `sidecar/src/services/audioToolStatus.ts`  
  检测 `ffmpeg`、`whisper`、`whisperx` 等可选音频工具状态。
- Create: `sidecar/src/routes/audioTools.ts`  
  提供 `GET /tools/audio/status`。
- Modify: `sidecar/src/server.ts`  
  挂载音频工具体检路由。
- Create: `sidecar/src/builtins/agents/<podcast-slug>/agent.json` and `AGENT.md` × 6  
  第一批播客工作室官方包。
- Modify: `sidecar/src/builtins/agents/index.test.ts`  
  覆盖 podcast pack 元数据完整性。
- Modify: `sidecar/src/services/builtinAgents.test.ts`  
  覆盖 `catalog_json` 同步、覆盖、缺省与克隆边界。
- Create: `sidecar/src/services/audioToolStatus.test.ts`  
  覆盖 PATH 检测与未配置状态。
- Modify: `src/lib/data/types.ts` and `src/lib/data/agents.ts`  
  增加 `podcast` 分类和 `catalogMetadata` 类型。
- Modify: `src/features/agent-workspaces/agent-catalog.ts` and `.test.ts`  
  支持播客分类与封面 fallback。
- Create: `src/features/agent-workspaces/AgentPackOverview.tsx`  
  详情页 Pack 能力概览和 sample task 按钮。
- Modify: `src/features/agent-workspaces/AgentCard.tsx`  
  对有 `catalogMetadata` 的官方 pack 显示 tagline、输入/输出、风险和工具摘要。
- Modify: `src/features/agent-workspaces/AgentSpaceView.tsx`  
  支持 sample task 预填 composer，插入 `AgentPackOverview`。
- Modify: `src/i18n/locales/{zh,en}/agents.json` and `agentSpace.json` if present  
  增加播客分类、pack 标签、工具状态和 sample task 文案。
- Create: `public/agent-covers/podcast.svg`  
  本地播客封面资产。

## Task 1: sidecar catalog metadata RED

**Files:**
- Modify: `sidecar/src/builtins/agents/index.test.ts`
- Modify: `sidecar/src/services/builtinAgents.test.ts`

- [ ] **Step 1: 写失败测试：内置清单必须包含 6 个 podcast pack**

在 `sidecar/src/builtins/agents/index.test.ts` 中把 `EXPECTED_SLUGS` 扩展为 13 个 slug，并增加 pack 元数据断言：

```ts
const EXPECTED_PODCAST_SLUGS = [
  "podcast-research-producer",
  "podcast-interview-editor",
  "podcast-growth-clips",
  "podcast-daily-briefing",
  "podcast-localization",
  "podcast-brand-keeper",
];

it("ships the first podcast studio packs with complete catalog metadata", () => {
  const podcast = BUILTIN_AGENT_DEFS.filter((agent) => agent.category === "podcast");
  expect(podcast.map((agent) => agent.slug)).toEqual(EXPECTED_PODCAST_SLUGS);

  for (const agent of podcast) {
    expect(agent.pack?.domain).toBe("audio");
    expect(agent.pack?.scenario).toBeTruthy();
    expect(agent.pack?.tagline.trim().length).toBeGreaterThan(0);
    expect(agent.pack?.inputTypes.length).toBeGreaterThanOrEqual(2);
    expect(agent.pack?.outputTypes.length).toBeGreaterThanOrEqual(3);
    expect(agent.pack?.riskTags.length).toBeGreaterThanOrEqual(1);
    expect(agent.pack?.sampleTasks.length).toBeGreaterThanOrEqual(3);
  }
});
```

- [ ] **Step 2: 写失败测试：reconcile 写入 catalog_json**

在 `sidecar/src/services/builtinAgents.test.ts` 中给 `DEF_A` 加 `pack`，并断言 service 返回 metadata：

```ts
const DEF_A: BuiltinAgentDef = {
  slug: "alpha",
  name: "Alpha",
  avatar: "blue",
  category: "development",
  coverImage: "development",
  instructions: "# Alpha\ninstr A",
  mountedSkills: ["s1", "s2"],
  pack: {
    domain: "audio",
    scenario: "podcast-production",
    tagline: "Alpha pack",
    inputTypes: ["audio", "text"],
    outputTypes: ["script", "shownotes"],
    optionalTools: ["ffmpeg"],
    riskTags: ["copyright"],
    sampleTasks: [{ title: "试跑", prompt: "生成一期播客脚本" }],
  },
};

expect(a.catalogMetadata?.tagline).toBe("Alpha pack");
expect(a.catalogMetadata?.sampleTasks[0]?.title).toBe("试跑");
expect(b.catalogMetadata).toBeNull();
```

- [ ] **Step 3: 运行 RED**

Run: `cd sidecar && bun test src/builtins/agents/index.test.ts src/services/builtinAgents.test.ts`

Expected: FAIL，因为 `podcast` 分类、`pack` 字段和 `catalogMetadata` 类型还不存在。

## Task 2: sidecar catalog metadata GREEN

**Files:**
- Modify: `sidecar/src/db.ts`
- Modify: `sidecar/src/services/agentWorkspaces.ts`
- Modify: `sidecar/src/builtins/agents/index.ts`
- Modify: `sidecar/src/services/builtinAgents.ts`

- [ ] **Step 1: 扩展 DB schema**

在 `agent_workspaces` 表增加列：

```sql
catalog_json TEXT
```

在 `migrate()` 中增加：

```ts
ensureColumn(db, "agent_workspaces", "catalog_json", "TEXT");
```

- [ ] **Step 2: 扩展分类与 metadata 类型**

在 `sidecar/src/services/agentWorkspaces.ts` 中把分类改为：

```ts
export const AGENT_FUNCTION_CATEGORIES = [
  "development",
  "research",
  "writing",
  "podcast",
  "automation",
  "general",
] as const;
```

增加：

```ts
export interface AgentCatalogMetadata {
  domain: string;
  scenario: string;
  tagline: string;
  inputTypes: string[];
  outputTypes: string[];
  optionalTools: string[];
  riskTags: string[];
  sampleTasks: Array<{ title: string; prompt: string }>;
}
```

`AgentWorkspace` 增加：

```ts
catalogMetadata: AgentCatalogMetadata | null;
```

`AgentWorkspaceRow` 增加：

```ts
catalog_json: string | null;
```

增加安全解析：

```ts
function parseCatalogMetadata(raw: string | null): AgentCatalogMetadata | null {
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw) as Partial<AgentCatalogMetadata>;
    if (
      typeof v.domain === "string" &&
      typeof v.scenario === "string" &&
      typeof v.tagline === "string" &&
      Array.isArray(v.inputTypes) &&
      Array.isArray(v.outputTypes) &&
      Array.isArray(v.optionalTools) &&
      Array.isArray(v.riskTags) &&
      Array.isArray(v.sampleTasks) &&
      v.inputTypes.every((x) => typeof x === "string") &&
      v.outputTypes.every((x) => typeof x === "string") &&
      v.optionalTools.every((x) => typeof x === "string") &&
      v.riskTags.every((x) => typeof x === "string") &&
      v.sampleTasks.every(
        (x) =>
          x &&
          typeof (x as { title?: unknown }).title === "string" &&
          typeof (x as { prompt?: unknown }).prompt === "string",
      )
    ) {
      return v as AgentCatalogMetadata;
    }
  } catch {
    // 损坏数据 → 不展示 pack metadata。
  }
  return null;
}
```

`rowToAgent` 增加：

```ts
catalogMetadata: parseCatalogMetadata(r.catalog_json),
```

- [ ] **Step 3: 扩展 BuiltinAgentDef**

在 `sidecar/src/builtins/agents/index.ts` 增加：

```ts
import type { AgentCatalogMetadata } from "../../services/agentWorkspaces";

export interface BuiltinAgentDef {
  // existing fields...
  pack?: AgentCatalogMetadata | null;
}
```

- [ ] **Step 4: reconcile 写入 catalog_json**

在 `sidecar/src/services/builtinAgents.ts` 增加：

```ts
function serializeCatalogMetadata(pack: BuiltinAgentDef["pack"]): string | null {
  return pack == null ? null : JSON.stringify(pack);
}
```

INSERT 字段增加 `catalog_json`；UPDATE 增加 `catalog_json = ?`。传参使用：

```ts
const catalog = serializeCatalogMetadata(def.pack);
```

- [ ] **Step 5: 运行 GREEN**

Run: `cd sidecar && bun test src/builtins/agents/index.test.ts src/services/builtinAgents.test.ts`

Expected: 当前仍可能 FAIL，因为 podcast pack 目录还未创建；catalog metadata 相关测试应不再报类型/字段缺失。

## Task 3: 新增 6 个播客 Pack 定义

**Files:**
- Create: `sidecar/src/builtins/agents/podcast-research-producer/{agent.json,AGENT.md}`
- Create: `sidecar/src/builtins/agents/podcast-interview-editor/{agent.json,AGENT.md}`
- Create: `sidecar/src/builtins/agents/podcast-growth-clips/{agent.json,AGENT.md}`
- Create: `sidecar/src/builtins/agents/podcast-daily-briefing/{agent.json,AGENT.md}`
- Create: `sidecar/src/builtins/agents/podcast-localization/{agent.json,AGENT.md}`
- Create: `sidecar/src/builtins/agents/podcast-brand-keeper/{agent.json,AGENT.md}`
- Modify: `sidecar/src/builtins/agents/index.ts`

- [ ] **Step 1: 创建 pack JSON**

每个 `agent.json` 必须包含：

```json
{
  "slug": "podcast-research-producer",
  "name": "资料播客制作人",
  "avatar": "orange",
  "category": "podcast",
  "coverImage": "podcast",
  "mountedSkills": ["agent-studio:pdf", "agent-studio:docx"],
  "pack": {
    "domain": "audio",
    "scenario": "podcast-production",
    "tagline": "把资料变成可录制的一期播客",
    "inputTypes": ["url", "pdf", "markdown", "text"],
    "outputTypes": ["script", "shownotes", "chapters", "publish-copy"],
    "optionalTools": ["ffmpeg", "whisper", "whisperx", "chattts"],
    "riskTags": ["copyright", "web-access", "file-read"],
    "sampleTasks": [
      {
        "title": "资料生成双人播客脚本",
        "prompt": "请基于我提供的资料，生成一期 20 分钟双人对谈播客脚本，并输出 episode-outline.md、script-dialogue.md、shownotes.md 和 publish-copy.md。"
      },
      {
        "title": "把研究笔记整理成节目大纲",
        "prompt": "请把这些研究笔记整理成一期播客的节目大纲，标出核心冲突、事实来源、适合展开的故事点和需要核验的信息。"
      },
      {
        "title": "生成单人口播版本",
        "prompt": "请把当前资料改写成 8 分钟单人口播稿，保留引用来源，并在结尾列出本期 shownotes。"
      }
    ]
  }
}
```

其它 5 个 pack 按设计 spec 的输入/输出和定位填写，sample task 每个不少于 3 个。

- [ ] **Step 2: 创建 AGENT.md**

每个 `AGENT.md` 保持统一结构：

```md
# 资料播客制作人

## 工作方式

- 你负责把资料整理成可录制的播客节目，而不是只做普通摘要。
- 开始前先确认节目受众、单集时长、主持人数、语气和资料范围。
- 输出文件默认放到 `output/podcast/<YYYY-MM-DD>-<episode-slug>/`。
- 不伪造嘉宾说过的话，不把未经核验的信息写成事实。
- 涉及版权、声音授权或来源不清的材料时，明确提醒用户确认。

## 回答

- 先给节目定位和核心叙事，再给脚本或产物清单。
- 如果生成文件，最后列出文件名、用途和建议下一步。
- 未实际调用音频工具时，不声称已经生成音频。
```

- [ ] **Step 3: 更新静态 import 清单**

在 `sidecar/src/builtins/agents/index.ts` 增加 12 行 import 和 6 个清单项。

- [ ] **Step 4: 运行测试**

Run: `cd sidecar && bun test src/builtins/agents/index.test.ts src/services/builtinAgents.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/db.ts sidecar/src/services/agentWorkspaces.ts sidecar/src/builtins/agents sidecar/src/services/builtinAgents.ts sidecar/src/builtins/agents/index.test.ts sidecar/src/services/builtinAgents.test.ts
git commit -m "feat(sidecar): add podcast agent pack metadata"
```

## Task 4: 音频工具体检 RED/GREEN

**Files:**
- Create: `sidecar/src/services/audioToolStatus.test.ts`
- Create: `sidecar/src/services/audioToolStatus.ts`
- Create: `sidecar/src/routes/audioTools.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: 写失败测试**

`sidecar/src/services/audioToolStatus.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { detectAudioToolStatus } from "./audioToolStatus";

describe("detectAudioToolStatus", () => {
  it("marks command-line tools ready when found in PATH", () => {
    const status = detectAudioToolStatus({
      pathEnv: "/bin:/usr/bin",
      exists: (path) => path.endsWith("/ffmpeg"),
      executableNames: ["ffmpeg"],
    });
    expect(status.ffmpeg).toBe("ready");
  });

  it("keeps optional model runners unconfigured when no command is present", () => {
    const status = detectAudioToolStatus({
      pathEnv: "",
      exists: () => false,
      executableNames: [],
    });
    expect(status.whisper).toBe("missing");
    expect(status.whisperx).toBe("missing");
    expect(status.chattts).toBe("unconfigured");
    expect(status.fishSpeech).toBe("unconfigured");
  });
});
```

- [ ] **Step 2: 运行 RED**

Run: `cd sidecar && bun test src/services/audioToolStatus.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 service**

`sidecar/src/services/audioToolStatus.ts`:

```ts
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface AudioToolStatus {
  ffmpeg: "ready" | "missing";
  whisper: "ready" | "missing" | "unconfigured";
  whisperx: "ready" | "missing" | "unconfigured";
  chattts: "ready" | "unconfigured" | "unsupported";
  fishSpeech: "ready" | "unconfigured" | "unsupported";
}

interface DetectOptions {
  pathEnv?: string;
  executableNames?: string[];
  exists?: (path: string) => boolean;
}

function hasCommand(name: string, opts: DetectOptions): boolean {
  if (opts.executableNames?.includes(name)) return true;
  const exists = opts.exists ?? existsSync;
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? "";
  return pathEnv.split(delimiter).some((dir) => dir.length > 0 && exists(join(dir, name)));
}

export function detectAudioToolStatus(opts: DetectOptions = {}): AudioToolStatus {
  return {
    ffmpeg: hasCommand("ffmpeg", opts) ? "ready" : "missing",
    whisper: hasCommand("whisper", opts) || hasCommand("whisper.cpp", opts) ? "ready" : "missing",
    whisperx: hasCommand("whisperx", opts) ? "ready" : "missing",
    chattts: hasCommand("chattts", opts) ? "ready" : "unconfigured",
    fishSpeech: hasCommand("fish-speech", opts) ? "ready" : "unconfigured",
  };
}
```

- [ ] **Step 4: 增加 route 并挂载**

`sidecar/src/routes/audioTools.ts`:

```ts
import { Hono } from "hono";
import { detectAudioToolStatus } from "../services/audioToolStatus";

export function buildAudioToolRoutes(): Hono {
  const app = new Hono();
  app.get("/tools/audio/status", (c) => c.json(detectAudioToolStatus()));
  return app;
}
```

在 `server.ts` import 并 `app.route("/", buildAudioToolRoutes())`。

- [ ] **Step 5: 运行 GREEN**

Run: `cd sidecar && bun test src/services/audioToolStatus.test.ts`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/services/audioToolStatus.ts sidecar/src/services/audioToolStatus.test.ts sidecar/src/routes/audioTools.ts sidecar/src/server.ts
git commit -m "feat(sidecar): expose audio tool status"
```

## Task 5: 前端类型与分类 RED/GREEN

**Files:**
- Modify: `src/lib/data/types.ts`
- Modify: `src/lib/data/agents.ts`
- Modify: `src/features/agent-workspaces/agent-catalog.ts`
- Modify: `src/features/agent-workspaces/agent-catalog.test.ts`
- Create: `public/agent-covers/podcast.svg`
- Modify: `src/i18n/locales/zh/agents.json`
- Modify: `src/i18n/locales/en/agents.json`

- [ ] **Step 1: 写失败测试**

在 `agent-catalog.test.ts` 增加：

```ts
it("includes podcast category tabs and filters podcast packs", () => {
  const agents = [
    { id: "a", category: "podcast", coverImage: "podcast" },
    { id: "b", category: "writing", coverImage: "writing" },
  ] as AgentWorkspace[];
  expect(buildAgentCategoryTabs(agents).some((tab) => tab.id === "podcast")).toBe(true);
  expect(filterAgentsByCategory(agents, "podcast").map((agent) => agent.id)).toEqual(["a"]);
  expect(coverImageForAgent(agents[0]!)).toBe("podcast");
});
```

- [ ] **Step 2: 运行 RED**

Run: `bun test src/features/agent-workspaces/agent-catalog.test.ts`

Expected: FAIL，因为 `podcast` 分类还不存在。

- [ ] **Step 3: 扩展类型与 catalog**

`AgentFunctionCategory` 增加 `"podcast"`；`AGENT_CATEGORY_ORDER` 增加 `"podcast"`；`CATEGORY_ALIASES` 增加：

```ts
"播客音频": "podcast",
```

`AGENT_CATEGORY_META` 增加：

```ts
podcast: {
  labelKey: "agents.categories.podcast",
  descriptionKey: "agents.categoryDescriptions.podcast",
},
```

- [ ] **Step 4: 增加 frontend catalog metadata 类型**

在 `src/lib/data/types.ts` 增加 `AgentCatalogMetadata`，`AgentWorkspace` 增加：

```ts
catalogMetadata: AgentCatalogMetadata | null;
```

- [ ] **Step 5: 增加 i18n 与封面**

中文：

```json
"podcast": "播客音频"
```

英文：

```json
"podcast": "Podcast"
```

`public/agent-covers/podcast.svg` 参考现有封面结构，使用本地 SVG，不引入外链。

- [ ] **Step 6: 运行 GREEN**

Run: `bun test src/features/agent-workspaces/agent-catalog.test.ts`

Expected: PASS。

## Task 6: Pack card 与详情预填 RED/GREEN

**Files:**
- Modify: `src/features/agent-workspaces/AgentCard.tsx`
- Create: `src/features/agent-workspaces/AgentPackOverview.tsx`
- Modify: `src/features/agent-workspaces/AgentSpaceView.tsx`
- Modify: `src/features/agent-workspaces/AgentsView.test.tsx`
- Modify: `src/features/agent-workspaces/AgentSpaceView.test.tsx`

- [ ] **Step 1: 写卡片失败测试**

在 `AgentsView.test.tsx` mock 一个 `catalogMetadata` agent，断言 tagline 和输入/输出文案可见：

```ts
expect(screen.getByText("把资料变成可录制的一期播客")).toBeInTheDocument();
expect(screen.getByText("PDF")).toBeInTheDocument();
expect(screen.getByText("shownotes")).toBeInTheDocument();
```

- [ ] **Step 2: 写详情失败测试**

在 `AgentSpaceView.test.tsx` mock detail agent，断言 sample task 按钮可见，点击后 composer 出现 prompt：

```ts
await user.click(screen.getByRole("button", { name: /资料生成双人播客脚本/ }));
expect(screen.getByText(/生成一期 20 分钟双人对谈播客脚本/)).toBeInTheDocument();
```

- [ ] **Step 3: 运行 RED**

Run: `bun test src/features/agent-workspaces/AgentsView.test.tsx src/features/agent-workspaces/AgentSpaceView.test.tsx`

Expected: FAIL，因为 UI 尚未显示 pack metadata。

- [ ] **Step 4: 实现 AgentCard 增强**

在 `AgentCard` 中：

```tsx
const metadata = agent.catalogMetadata;
const description = metadata?.tagline ?? t(AGENT_CATEGORY_META[category].descriptionKey);
```

若 `metadata` 存在，渲染最多 3 个 input chips、3 个 output chips 和风险数量；使用 `bg-muted`、`text-muted-foreground`、`border-border` 等现有 token utility。

- [ ] **Step 5: 实现 AgentPackOverview**

组件 props：

```ts
interface AgentPackOverviewProps {
  metadata: AgentCatalogMetadata;
  onUseSampleTask: (prompt: string) => void;
}
```

渲染：tagline、inputTypes、outputTypes、optionalTools、riskTags、sampleTasks。

- [ ] **Step 6: 接入 AgentSpaceView**

给 `AgentSpaceView` 增加：

```ts
const [draftPrompt, setDraftPrompt] = useState("");
```

将 `SlashEditor` 改为受控或支持 key 重建的方式预填 sample prompt；如果 `SlashEditor` 已有受控 API，使用现有 API。没有受控 API 时，优先给 `SlashEditor` 增加 `initialContent` 或 `value/onChange` 的最小扩展，并补测试。

- [ ] **Step 7: 运行 GREEN**

Run: `bun test src/features/agent-workspaces/AgentsView.test.tsx src/features/agent-workspaces/AgentSpaceView.test.tsx`

Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/types.ts src/lib/data/agents.ts src/features/agent-workspaces src/i18n/locales public/agent-covers/podcast.svg
git commit -m "feat(agent-gallery): show podcast agent packs"
```

## Task 7: 全量验证与修复

**Files:**
- Touch only files required by failing tests or type errors.

- [ ] **Step 1: sidecar tests**

Run: `cd sidecar && bun test`

Expected: PASS。若失败，先读失败用例，按 TDD 最小修复。

- [ ] **Step 2: frontend feature tests**

Run: `bun test src/features/agent-workspaces`

Expected: PASS。

- [ ] **Step 3: TypeScript**

Run: `bunx tsc --noEmit -p tsconfig.app.json`

Expected: PASS。

- [ ] **Step 4: Build**

Run: `bun run build`

Expected: PASS。

- [ ] **Step 5: Final commit**

若 Task 7 有修复：

```bash
git add <fixed-files>
git commit -m "fix: stabilize podcast agent packs mvp"
```

## Self-Review

- Spec coverage: 6 个 podcast pack、`catalog_json`、播客分类、卡片/详情增强、sample task、工具体检、风险提示、测试与验证均有任务覆盖。
- Placeholder scan: 本计划不包含占位词或“照前文处理”式步骤。
- Type consistency: 后端字段使用 `catalog_json`，API 类型使用 `catalogMetadata`，内置 JSON 字段使用 `pack`，三者职责固定。
