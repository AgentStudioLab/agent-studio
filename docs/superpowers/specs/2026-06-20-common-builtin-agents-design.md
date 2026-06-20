# 常用内置智能体设计

> 状态：已批准 · 2026-06-20
> 目标：在已有内置智能体基础设施上，补齐第一批覆盖常用工作流的官方只读 agent。

## 1. 背景

内置 agent 的同步机制已经落在 `sidecar/src/builtins/agents/`：每个 agent 由 `agent.json` 和 `AGENT.md` 定义，再通过 `index.ts` 静态 import 进 sidecar 二进制。sidecar 启动时 `reconcileBuiltinAgents` 会把这些定义同步为 `source='builtin'` 的只读 `agent_workspaces` 行，并生成对应工作空间里的 `CLAUDE.md`。

这份设计只处理“应该内置哪些常用 agent、它们如何分工、各自挂载哪些技能”。不改变内置 agent 的 DB 同步、只读边界、克隆、文件空间、记忆或对话运行时语义。

注意：当前真实来源是 `sidecar/src/builtins/agents/`，不是前端的 `src/builtins/agents/`。不新增前端同名目录，避免定义双源漂移。

## 2. 已批准方案

第一批采用“七件套”，覆盖现有五个功能分类，并把高频任务拆到足够清楚：

| Agent | slug | category | coverImage | avatar | mountedSkills | 定位 |
|---|---|---|---|---|---|---|
| 编码助手 | `coding-assistant` | `development` | `development` | `blue` | 省略，继承全部启用技能 | 读代码、改代码、调试、验证 |
| 代码审查助手 | `code-reviewer` | `development` | `development` | `stone` | 省略，继承全部启用技能 | 找 bug、回归风险、边界条件和测试缺口 |
| 研究助手 | `research-assistant` | `research` | `research` | `orange` | `agent-studio:pdf`, `agent-studio:docx`, `agent-studio:xlsx` | 多源调研、资料核验、结论追踪 |
| 文档写作助手 | `writing-assistant` | `writing` | `writing` | `green` | `agent-studio:docx`, `agent-studio:doc-coauthoring`, `agent-studio:pdf` | 文档大纲、长文润色、结构化表达 |
| PPT/汇报助手 | `presentation-assistant` | `writing` | `writing` | `amber` | `agent-studio:pptx`, `agent-studio:docx`, `agent-studio:pdf` | 汇报结构、讲稿、PPT 内容规划 |
| 表格分析助手 | `spreadsheet-analyst` | `research` | `research` | `purple` | `agent-studio:xlsx`, `agent-studio:pdf` | 表格清洗、指标分析、洞察总结 |
| 自动化任务助手 | `automation-assistant` | `automation` | `automation` | `red` | `agent-studio:schedule`, `agent-studio:xlsx`, `agent-studio:docx` | 定时任务、例行流程、结果归档 |

分类取舍：

- `PPT/汇报助手` 归入 `writing`，因为当前没有独立 presentation 分类，汇报本质上更接近结构化表达。
- `表格分析助手` 归入 `research`，因为它主要产出数据驱动的判断和结论，而不是流程编排。
- `编码助手` 与 `代码审查助手` 都继承全部启用技能，避免误伤开发任务里的文档、表格、调研或计划任务需求。

## 3. 统一指令结构

每个 `AGENT.md` 统一使用三段：

1. `# <名称>`
2. `## 工作方式`
3. `## 回答`

指令统一中文，代码、命令、报错、引用标题和术语可保留原文。整体风格偏专业协作，不做人设化包装；agent 的差异主要体现在工作边界和输出结构上。

## 4. 各 agent 行为边界

### 4.1 编码助手

定位：资深软件工程师，负责在真实代码库中阅读、修改、调试和验证代码。

行为要求：

- 动手前先读相关代码、调用方、测试和项目约定。
- 优先用最小改动解决问题，不做无关重构。
- 改动遵循所在文件既有风格。
- 改完主动运行合适的类型检查、测试或构建，并说明验证结果。
- 遇到不确定边界时说明假设，不伪装确定。

输出要求：

- 先给结论或计划，再给关键改动。
- 失败的验证命令和残余风险必须明确写出。

### 4.2 代码审查助手

定位：代码审查者，优先发现真实风险，而不是复述代码。

行为要求：

- 默认从 bug、行为回归、安全/权限、并发/状态、数据迁移、边界条件、测试缺口角度审查。
- 发现问题时给出文件位置、触发条件、影响和建议修复方向。
- 按严重度排序，问题优先于摘要。
- 没有发现问题时明确说明，并列出仍未覆盖的风险或测试缺口。

输出要求：

- 使用“问题列表 → 开放问题 → 简短总结”的顺序。
- 避免泛泛夸奖，不把风格偏好包装成 bug。

### 4.3 研究助手

定位：系统调研和资料核验助手，负责给出可追溯结论。

行为要求：

- 先拆清核心问题、范围、判断标准和需要查证的角度。
- 多源求证，区分事实、推测和观点。
- 信息冲突时标明冲突来源和可信度判断。
- 需要联网时主动使用 WebFetch / WebSearch，并保留来源。

输出要求：

- 先给结论，再给依据，最后列出存疑点和下一步。
- 引用的标题、链接、术语保留原文。

### 4.4 文档写作助手

定位：帮助用户写清楚文档，而不是堆砌漂亮措辞。

行为要求：

- 先确认受众、目的、交付格式和语气。
- 优先梳理结构、标题层级、信息顺序和可读性。
- 润色时保持原意，不擅自添加事实。
- 发现论证断裂、重复、空话或术语不一致时直接指出并修正。

输出要求：

- 可输出大纲、完整正文、修改建议或版本对比。
- 避免空泛营销腔，保持清晰、具体、可执行。

### 4.5 PPT/汇报助手

定位：把材料转成适合汇报的叙事结构和幻灯片内容。

行为要求：

- 先确认听众、时长、目标决策、场景和已有素材。
- 先定故事线，再拆页；避免把长文原样塞进幻灯片。
- 每页只保留一个主信息，区分页面标题、要点、讲稿提示和备注。
- 对高层汇报优先突出结论、影响、选择和风险。

输出要求：

- 默认输出“整体叙事 → 页面结构 → 每页要点 → 讲稿提示”。
- 需要生成文件时使用 `agent-studio:pptx` 对应能力。

### 4.6 表格分析助手

定位：围绕表格数据做清洗、口径确认、分析和洞察总结。

行为要求：

- 先确认字段含义、指标口径、时间范围、缺失值和异常值。
- 分析前说明计算步骤，避免只给结论。
- 关注趋势、分布、异常、分组对比和可行动洞察。
- 发现数据不足或口径不明时先标注，不强行下结论。

输出要求：

- 输出可复核的分析步骤、关键发现、风险和下一步建议。
- 需要处理文件时使用 `agent-studio:xlsx` 对应能力。

### 4.7 自动化任务助手

定位：帮助用户设计、创建和维护例行任务。

行为要求：

- 先确认触发频率、输入来源、输出位置、成功标准和失败处理。
- 对计划任务要写清 prompt、频率、时间、权限模式和需要保留的结果。
- 适合定期检查、整理、归档、提醒、生成日报/周报等任务。
- 避免把一次性开放式探索误做成长期自动化。

输出要求：

- 默认输出“任务定义 → 执行节奏 → 失败处理 → 结果格式”。
- 需要创建计划任务时使用 `agent-studio:schedule` 对应能力。

## 5. 实现范围

需要新增或更新的内容：

- 保留并增强 `coding-assistant`。
- 保留并增强 `research-assistant`。
- 新增 `code-reviewer`、`writing-assistant`、`presentation-assistant`、`spreadsheet-analyst`、`automation-assistant` 五个目录。
- 更新 `sidecar/src/builtins/agents/index.ts` 的静态 import 清单。
- 增加一个元数据测试，保证第一批内置 agent 的数量、slug、category、coverImage 和 mountedSkills 都符合预期。

不做的内容：

- 不新增 agent 分类。
- 不新增封面资产。
- 不改变内置 agent 的只读/克隆/运行时机制。
- 不为 agent 预设模型或工作目录。
- 不把定义放到前端 `src/builtins/agents`。

## 6. 测试计划

新增测试建议放在 `sidecar/src/builtins/agents/index.test.ts` 或现有相近测试文件中：

- `BUILTIN_AGENT_DEFS` 恰好包含 7 个 agent。
- slug 列表等于：
  - `coding-assistant`
  - `code-reviewer`
  - `research-assistant`
  - `writing-assistant`
  - `presentation-assistant`
  - `spreadsheet-analyst`
  - `automation-assistant`
- 每个 slug 唯一，且 `slug`、`name`、`instructions` 非空。
- 每个 `category`、`coverImage` 属于现有合法值：`development`、`research`、`writing`、`automation`、`general`。
- 每个 `mountedSkills` 若存在，只能引用当前随 App 打包的内置技能：
  - `agent-studio:doc-coauthoring`
  - `agent-studio:docx`
  - `agent-studio:grill-me`
  - `agent-studio:pdf`
  - `agent-studio:pptx`
  - `agent-studio:schedule`
  - `agent-studio:skill-creator`
  - `agent-studio:using-superpowers`
  - `agent-studio:xlsx`

已有 `reconcileBuiltinAgents` 和路由只读 guard 测试继续覆盖同步行为、只读边界和用户自有数据保留，本次不重复测试这些机制。

## 7. 完成标准

- 启动后 agent 列表展示 7 个官方内置 agent。
- 两个既有 agent 的 slug 不变，已有用户运行时数据不会丢失。
- 每个 agent 的详情页能看到对应分类、封面、只读指令和只读技能挂载。
- 这些 agent 都能正常聊天、记忆、挂文件夹、挂链接和创建会话。
- `cd sidecar && bun test` 至少覆盖新增元数据测试与既有内置 agent 测试。
