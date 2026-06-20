# Common Builtin Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把第一批 7 个常用官方内置 agent 落到 `sidecar/src/builtins/agents/`，并用元数据测试锁住清单、分类、封面和技能挂载。

**Architecture:** 沿用现有 sidecar 内置 agent 机制：每个 agent 是一个 `agent.json` 加一个 `AGENT.md`，`index.ts` 静态 import 后暴露 `BUILTIN_AGENT_DEFS`。本计划不改 DB、reconcile、路由 guard、前端 UI 或运行时语义。

**Tech Stack:** Bun test runner、TypeScript、sidecar 静态 JSON import、Markdown text import。

---

## 文件结构

- Modify: `sidecar/src/builtins/agents/index.ts`
  - 负责静态 import 7 个内置 agent，并按批准顺序导出 `BUILTIN_AGENT_DEFS`。
- Modify: `sidecar/src/builtins/agents/coding-assistant/agent.json`
  - 保持 slug 不变，保留 `development` 分类。
- Modify: `sidecar/src/builtins/agents/coding-assistant/AGENT.md`
  - 增强编码助手的验证、最小改动和风险说明要求。
- Modify: `sidecar/src/builtins/agents/research-assistant/agent.json`
  - 保持 slug 不变，保留 `research` 分类与 `pdf/docx/xlsx` 技能挂载。
- Modify: `sidecar/src/builtins/agents/research-assistant/AGENT.md`
  - 增强调研边界、来源、事实/推测/观点区分。
- Create: `sidecar/src/builtins/agents/code-reviewer/agent.json`
- Create: `sidecar/src/builtins/agents/code-reviewer/AGENT.md`
- Create: `sidecar/src/builtins/agents/writing-assistant/agent.json`
- Create: `sidecar/src/builtins/agents/writing-assistant/AGENT.md`
- Create: `sidecar/src/builtins/agents/presentation-assistant/agent.json`
- Create: `sidecar/src/builtins/agents/presentation-assistant/AGENT.md`
- Create: `sidecar/src/builtins/agents/spreadsheet-analyst/agent.json`
- Create: `sidecar/src/builtins/agents/spreadsheet-analyst/AGENT.md`
- Create: `sidecar/src/builtins/agents/automation-assistant/agent.json`
- Create: `sidecar/src/builtins/agents/automation-assistant/AGENT.md`
- Create: `sidecar/src/builtins/agents/index.test.ts`
  - 只测试真实打包清单的内容质量，不重复测试 reconcile/DB 行为。

## Task 1: 新增内置 agent 元数据红灯测试

**Files:**
- Create: `sidecar/src/builtins/agents/index.test.ts`

- [ ] **Step 1: 写失败测试**

Create `sidecar/src/builtins/agents/index.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { BUILTIN_AGENT_DEFS } from ".";

const EXPECTED_SLUGS = [
  "coding-assistant",
  "code-reviewer",
  "research-assistant",
  "writing-assistant",
  "presentation-assistant",
  "spreadsheet-analyst",
  "automation-assistant",
];

const VALID_CATEGORIES = new Set(["development", "research", "writing", "automation", "general"]);
const VALID_COVERS = VALID_CATEGORIES;
const VALID_MOUNTED_SKILLS = new Set([
  "agent-studio:doc-coauthoring",
  "agent-studio:docx",
  "agent-studio:grill-me",
  "agent-studio:pdf",
  "agent-studio:pptx",
  "agent-studio:schedule",
  "agent-studio:skill-creator",
  "agent-studio:using-superpowers",
  "agent-studio:xlsx",
]);

describe("BUILTIN_AGENT_DEFS", () => {
  it("ships the approved seven common builtin agents in a stable order", () => {
    expect(BUILTIN_AGENT_DEFS.map((agent) => agent.slug)).toEqual(EXPECTED_SLUGS);
  });

  it("keeps each bundled agent definition complete and valid", () => {
    const seen = new Set<string>();

    for (const agent of BUILTIN_AGENT_DEFS) {
      expect(agent.slug).toBeTruthy();
      expect(seen.has(agent.slug)).toBe(false);
      seen.add(agent.slug);

      expect(agent.name.trim().length).toBeGreaterThan(0);
      expect(agent.instructions.trim().length).toBeGreaterThan(0);
      expect(agent.instructions).toContain("## 工作方式");
      expect(agent.instructions).toContain("## 回答");

      expect(VALID_CATEGORIES.has(agent.category ?? "general")).toBe(true);
      expect(VALID_COVERS.has(agent.coverImage ?? agent.category ?? "general")).toBe(true);

      for (const skillId of agent.mountedSkills ?? []) {
        expect(VALID_MOUNTED_SKILLS.has(skillId)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run:

```bash
cd sidecar && bun test src/builtins/agents/index.test.ts
```

Expected: FAIL because `BUILTIN_AGENT_DEFS.map((agent) => agent.slug)` still returns only `["coding-assistant", "research-assistant"]`.

## Task 2: 更新现有两个 agent 定义

**Files:**
- Modify: `sidecar/src/builtins/agents/coding-assistant/AGENT.md`
- Modify: `sidecar/src/builtins/agents/research-assistant/AGENT.md`

- [ ] **Step 1: 更新编码助手指令**

Replace `sidecar/src/builtins/agents/coding-assistant/AGENT.md` with:

```md
# 编码助手

你是一名资深软件工程师，擅长在真实代码库中阅读、修改、调试和验证代码。

## 工作方式

- 动手改之前先读懂相关代码：确认调用方、依赖、测试和项目约定，再决定方案。
- 优先用最小改动解决问题，不做未被要求的重构或顺手优化。
- 改动遵循所在文件既有的命名、风格与注释密度。
- 涉及多步任务时，先给一个简短计划，再逐步执行并自检。
- 改完主动运行合适的类型检查、测试或构建，并说明验证结果。
- 遇到不确定边界时明确说明假设，不要假装确定。

## 回答

- 用中文回答；代码、命令、报错信息保留原文。
- 先给结论或计划，再给关键改动和验证结果。
- 失败的验证命令、未覆盖风险和需要用户决定的取舍必须明确写出。
```

- [ ] **Step 2: 更新研究助手指令**

Replace `sidecar/src/builtins/agents/research-assistant/AGENT.md` with:

```md
# 研究助手

你擅长就一个主题做系统调研，并给出有依据、可追溯的结论。

## 工作方式

- 先把问题拆清楚：核心问题是什么、边界在哪、判断标准是什么、需要哪些角度。
- 多源求证：对关键结论交叉核对，区分事实、推测与观点。
- 给出结论时附上来源；信息不足或有冲突时如实说明，不臆断。
- 信息冲突时标明冲突来源，并给出可信度判断。
- 需要联网时用 WebFetch / WebSearch 获取并核实资料。

## 回答

- 用中文回答；引用的标题、链接、术语保留原文。
- 结构清晰：先给结论，再展开依据，最后列出存疑点和下一步。
- 对不确定内容明确标注，不把推测写成事实。
```

## Task 3: 新增五个 agent 定义并更新静态清单

**Files:**
- Create: `sidecar/src/builtins/agents/code-reviewer/agent.json`
- Create: `sidecar/src/builtins/agents/code-reviewer/AGENT.md`
- Create: `sidecar/src/builtins/agents/writing-assistant/agent.json`
- Create: `sidecar/src/builtins/agents/writing-assistant/AGENT.md`
- Create: `sidecar/src/builtins/agents/presentation-assistant/agent.json`
- Create: `sidecar/src/builtins/agents/presentation-assistant/AGENT.md`
- Create: `sidecar/src/builtins/agents/spreadsheet-analyst/agent.json`
- Create: `sidecar/src/builtins/agents/spreadsheet-analyst/AGENT.md`
- Create: `sidecar/src/builtins/agents/automation-assistant/agent.json`
- Create: `sidecar/src/builtins/agents/automation-assistant/AGENT.md`
- Modify: `sidecar/src/builtins/agents/index.ts`

- [ ] **Step 1: 新增代码审查助手**

Create `sidecar/src/builtins/agents/code-reviewer/agent.json`:

```json
{
  "slug": "code-reviewer",
  "name": "代码审查助手",
  "avatar": "stone",
  "category": "development",
  "coverImage": "development"
}
```

Create `sidecar/src/builtins/agents/code-reviewer/AGENT.md`:

```md
# 代码审查助手

你是一名严格、务实的代码审查者，优先发现真实风险，而不是复述代码或泛泛夸奖。

## 工作方式

- 默认从 bug、行为回归、安全与权限、并发与状态、数据迁移、边界条件、可维护性和测试缺口角度审查。
- 发现问题时给出文件位置、触发条件、影响和建议修复方向。
- 按严重度排序，问题优先于摘要。
- 不把个人风格偏好包装成 bug；除非风格问题会造成明确维护成本或行为风险。
- 如果没有发现问题，明确说明，并列出仍未覆盖的风险或测试缺口。

## 回答

- 用中文回答；代码、命令、报错信息保留原文。
- 默认输出顺序是：问题列表、开放问题、简短总结。
- 每个问题尽量包含严重度、位置、原因和建议修复方向。
```

- [ ] **Step 2: 新增文档写作助手**

Create `sidecar/src/builtins/agents/writing-assistant/agent.json`:

```json
{
  "slug": "writing-assistant",
  "name": "文档写作助手",
  "avatar": "green",
  "category": "writing",
  "coverImage": "writing",
  "mountedSkills": ["agent-studio:docx", "agent-studio:doc-coauthoring", "agent-studio:pdf"]
}
```

Create `sidecar/src/builtins/agents/writing-assistant/AGENT.md`:

```md
# 文档写作助手

你帮助用户把文档写清楚、写扎实，而不是堆砌漂亮但空泛的措辞。

## 工作方式

- 先确认受众、目的、交付格式、使用场景和语气。
- 优先梳理结构、标题层级、信息顺序和可读性。
- 润色时保持原意，不擅自添加事实。
- 发现论证断裂、重复、空话、术语不一致或读者可能误解的地方时，直接指出并修正。
- 需要产出 Word 文档时使用对应文档能力；需要读取 PDF 或 docx 素材时先提取再整理。

## 回答

- 用中文回答；引用标题、术语和原文片段可保留原文。
- 根据用户需要输出大纲、完整正文、修改建议或版本对比。
- 避免空泛营销腔，保持清晰、具体、可执行。
```

- [ ] **Step 3: 新增 PPT/汇报助手**

Create `sidecar/src/builtins/agents/presentation-assistant/agent.json`:

```json
{
  "slug": "presentation-assistant",
  "name": "PPT/汇报助手",
  "avatar": "amber",
  "category": "writing",
  "coverImage": "writing",
  "mountedSkills": ["agent-studio:pptx", "agent-studio:docx", "agent-studio:pdf"]
}
```

Create `sidecar/src/builtins/agents/presentation-assistant/AGENT.md`:

```md
# PPT/汇报助手

你擅长把材料转成适合汇报的叙事结构、幻灯片内容和讲稿提示。

## 工作方式

- 先确认听众、时长、目标决策、汇报场景和已有素材。
- 先定故事线，再拆页面；不要把长文原样塞进幻灯片。
- 每页只保留一个主信息，区分页面标题、要点、讲稿提示和备注。
- 面向高层汇报时优先突出结论、影响、选择、风险和需要拍板的问题。
- 需要生成或编辑演示文稿时使用对应 PPT 能力。

## 回答

- 用中文回答；专有名词、产品名、引用标题可保留原文。
- 默认输出整体叙事、页面结构、每页要点和讲稿提示。
- 如果材料不足，先列出缺口，再给出可先行使用的汇报骨架。
```

- [ ] **Step 4: 新增表格分析助手**

Create `sidecar/src/builtins/agents/spreadsheet-analyst/agent.json`:

```json
{
  "slug": "spreadsheet-analyst",
  "name": "表格分析助手",
  "avatar": "purple",
  "category": "research",
  "coverImage": "research",
  "mountedSkills": ["agent-studio:xlsx", "agent-studio:pdf"]
}
```

Create `sidecar/src/builtins/agents/spreadsheet-analyst/AGENT.md`:

```md
# 表格分析助手

你围绕表格数据做清洗、口径确认、分析和洞察总结，帮助用户得到可复核的判断。

## 工作方式

- 先确认字段含义、指标口径、时间范围、缺失值、异常值和分析目标。
- 分析前说明计算步骤，避免只给结论。
- 关注趋势、分布、异常、分组对比、相关变化和可行动洞察。
- 发现数据不足、口径不明或样本偏差时先标注，不强行下结论。
- 需要处理 Excel、CSV 或 TSV 时使用对应表格能力；需要读取 PDF 报表时先提取再分析。

## 回答

- 用中文回答；字段名、公式、文件名和报错信息保留原文。
- 输出可复核的分析步骤、关键发现、风险和下一步建议。
- 对每个重要结论说明它来自哪些字段或计算。
```

- [ ] **Step 5: 新增自动化任务助手**

Create `sidecar/src/builtins/agents/automation-assistant/agent.json`:

```json
{
  "slug": "automation-assistant",
  "name": "自动化任务助手",
  "avatar": "red",
  "category": "automation",
  "coverImage": "automation",
  "mountedSkills": ["agent-studio:schedule", "agent-studio:xlsx", "agent-studio:docx"]
}
```

Create `sidecar/src/builtins/agents/automation-assistant/AGENT.md`:

```md
# 自动化任务助手

你帮助用户设计、创建和维护例行任务，让重复工作按清晰节奏自动完成。

## 工作方式

- 先确认触发频率、输入来源、输出位置、成功标准和失败处理。
- 对计划任务写清 prompt、频率、时间、权限模式和需要保留的结果。
- 适合定期检查、整理、归档、提醒、生成日报或周报等任务。
- 避免把一次性开放式探索误做成长期自动化。
- 需要创建计划任务时使用对应计划任务能力。

## 回答

- 用中文回答；命令、文件路径、任务名称和报错信息保留原文。
- 默认输出任务定义、执行节奏、失败处理和结果格式。
- 对可能造成重复通知、误触发或权限风险的设计主动提醒。
```

- [ ] **Step 6: 更新静态 import 清单**

Modify `sidecar/src/builtins/agents/index.ts` imports and `BUILTIN_AGENT_DEFS`:

```ts
import codingMeta from "./coding-assistant/agent.json";
import codingMd from "./coding-assistant/AGENT.md" with { type: "text" };
import codeReviewerMeta from "./code-reviewer/agent.json";
import codeReviewerMd from "./code-reviewer/AGENT.md" with { type: "text" };
import researchMeta from "./research-assistant/agent.json";
import researchMd from "./research-assistant/AGENT.md" with { type: "text" };
import writingMeta from "./writing-assistant/agent.json";
import writingMd from "./writing-assistant/AGENT.md" with { type: "text" };
import presentationMeta from "./presentation-assistant/agent.json";
import presentationMd from "./presentation-assistant/AGENT.md" with { type: "text" };
import spreadsheetMeta from "./spreadsheet-analyst/agent.json";
import spreadsheetMd from "./spreadsheet-analyst/AGENT.md" with { type: "text" };
import automationMeta from "./automation-assistant/agent.json";
import automationMd from "./automation-assistant/AGENT.md" with { type: "text" };
```

`BUILTIN_AGENT_DEFS` should be:

```ts
export const BUILTIN_AGENT_DEFS: BuiltinAgentDef[] = [
  { ...codingMeta, instructions: codingMd },
  { ...codeReviewerMeta, instructions: codeReviewerMd },
  { ...researchMeta, instructions: researchMd },
  { ...writingMeta, instructions: writingMd },
  { ...presentationMeta, instructions: presentationMd },
  { ...spreadsheetMeta, instructions: spreadsheetMd },
  { ...automationMeta, instructions: automationMd },
];
```

- [ ] **Step 7: 运行红灯测试确认转绿**

Run:

```bash
cd sidecar && bun test src/builtins/agents/index.test.ts
```

Expected: PASS, 2 tests.

## Task 4: 验证现有内置 agent 同步行为未回归

**Files:**
- Verify only

- [ ] **Step 1: 运行内置定义和 reconcile/route 测试**

Run:

```bash
cd sidecar && bun test src/builtins/agents/index.test.ts src/services/builtinAgents.test.ts src/routes/agentWorkspaces.builtin.test.ts
```

Expected: PASS. Existing reconcile tests should now still pass, with real bundled defs reconciling cleanly.

- [ ] **Step 2: 运行 TypeScript 检查并记录结果**

Run:

```bash
cd sidecar && bunx tsc --noEmit
```

Expected for this branch: either PASS, or the same pre-existing provider errors observed before this work:

```text
src/agui/provider-claude/bridge.ts(24,39): error TS2307: Cannot find module '@anthropic-ai/sdk/resources/beta/messages' or its corresponding type declarations.
src/agui/provider-official/official-provider.test.ts(...): error TS2339: Property 'enqueue'/'close' does not exist on type 'never'.
```

If new errors mention `sidecar/src/builtins/agents/`, fix them before proceeding.

- [ ] **Step 3: 检查 diff 范围**

Run:

```bash
git diff --stat
git diff --check
```

Expected: only plan doc plus `sidecar/src/builtins/agents/` files changed; `git diff --check` exits 0.
