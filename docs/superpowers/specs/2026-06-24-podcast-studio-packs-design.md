# 播客工作室智能体包设计

> 状态：已批准 · 2026-06-24  
> 目标：把智能体广场第一版扩展为面向“播客音频生产”的细分场景 Agent Pack，让用户从资料、音频或链接出发，快速得到脚本、转写、章节、shownotes、拆条文案和可选音频产物。

## 1. 背景

当前 Agent Studio 已经具备智能体广场的基础：

- `sidecar/src/builtins/agents/` 支持仓库内 JSON + `AGENT.md` 定义官方只读内置 agent。
- `/agents` 已经有分类 tab、搜索、排序、本地封面和官方标识。
- 每个 agent 都有独立 homeDir、`CLAUDE.md`、memory、folders、links、mounted skills、recent conversations 和 scheduled tasks。
- 任务运行时已经能沉淀过程、文件产物、工具调用和右侧预览。

现有“常用内置智能体”覆盖开发、研究、写作、自动化等泛场景，但缺少垂直领域的强场景表达。用户希望智能体广场里出现更多细分领域 agent，第一版优先做“播客音频生产”。

本设计选择 **Podcast Studio Packs / 播客工作室智能体包**：把一个广场条目从“一个 agent 名称 + 指令”升级为“一个可试跑、可克隆、可解释工具需求的播客生产场景包”。

## 2. GitHub 生态启发

播客音频生产可以借鉴以下开源项目，但第一版不把重型音频模型直接打进桌面端：

| 能力 | 参考项目 | 启发 |
|---|---|---|
| 资料转播客 | `souzatharsis/podcastfy` | 把多模态资料生成类似 NotebookLM 的播客对话 |
| 转写 | `openai/whisper`、`ggml-org/whisper.cpp`、`SYSTRAN/faster-whisper` | 本地或外部 runner 做音频转写 |
| 词级时间轴/说话人 | `m-bain/whisperX`、`pyannote/pyannote-audio` | 长访谈可生成章节、金句、剪辑点 |
| 中文 TTS | `2noise/ChatTTS`、`fishaudio/fish-speech`、`resemble-ai/chatterbox` | 可选生成试听音频，不作为 MVP 必需能力 |
| 音频处理 | `ffmpeg`、`deezer/spleeter` | 格式转换、切片、降噪或人声分离可作为后续工具适配 |
| 信息源 | `RSSHub/RSSHub`、`RSSNext/Folo` | 每日音频简报可从 RSS/网页/链接集合生成 |

设计取舍：

- Agent Studio 负责流程编排、上下文、产物管理、权限说明和用户体验。
- Whisper、TTS、ffmpeg 等作为“可选本机工具 / 外部 runner / 未来插件”，不强依赖。
- 第一版先把脚本、转写文本、shownotes、章节、拆条文案和任务模板做扎实；音频生成作为可选增强入口。

## 3. 产品目标

### 3.1 用户目标

- 用户不用写复杂 prompt，也能从官方精选包开始一次播客生产任务。
- 用户能清楚知道每个 pack 适合什么输入、会产出什么文件、需要哪些工具。
- 用户能把一次成功的栏目风格沉淀到该 agent 的 memory，而不是每次重讲口吻和格式。
- 用户能把长音频变成可发布的多种资产：shownotes、标题、摘要、章节、短内容文案、剪辑清单。

### 3.2 产品目标

- 让智能体广场从“泛 agent 列表”变成“可拿来开工的场景包库”。
- 建立 Agent Pack 元数据模型，为后续视频、数字人、课程、营销等细分领域复用。
- 复用现有内置 agent、mounted skills、scheduled tasks、files/artifacts，不在第一版引入复杂编排引擎。

## 4. 已确认方向

| 维度 | 决策 |
|---|---|
| 第一领域 | 播客音频生产 |
| 形态 | 官方精选 Agent Pack，不开放社区导入 |
| 运行时 | 仍然是单 agent 运行，不引入多 agent 编排 |
| 重型工具 | 只做工具需求/检测/任务提示，暂不随 App 打包模型 |
| 音频生成 | 第一版可选，不承诺一键高质量成片 |
| 数据来源 | Pack 定义仍由 sidecar 内置清单维护，避免前后端双源漂移 |
| 复用机制 | 用户可克隆官方 pack 为自己的 agent，后续编辑指令和技能 |

## 5. 第一批 Podcast Studio Packs

第一版新增 6 个官方 pack。它们都属于同一个垂直领域，但覆盖不同生产阶段。

| Pack | slug | 分类建议 | 核心输入 | 核心产出 | 定位 |
|---|---|---|---|---|---|
| 资料播客制作人 | `podcast-research-producer` | `podcast` | 网页、PDF、Markdown、笔记、链接 | 选题、双人脚本、片头片尾、章节、shownotes | 从资料到一期节目 |
| 访谈剪辑助理 | `podcast-interview-editor` | `podcast` | 访谈音频、转写稿 | 转写整理、说话人标注、金句、章节、剪辑点 | 长访谈后期整理 |
| 播客拆条增长助手 | `podcast-growth-clips` | `podcast` | 长音频、转写稿、节目主题 | 短内容选题、标题、钩子、平台文案、clips.csv | 一期多发增长 |
| 每日音频简报助手 | `podcast-daily-briefing` | `podcast` | RSS、网页、文件夹、关键词 | 5 分钟简报脚本、摘要、引用来源、定时任务模板 | 周期性信息播报 |
| 播客本地化助手 | `podcast-localization` | `podcast` | 英文音频、字幕、转写稿 | 中文译稿、术语表、双语 shownotes、SRT | 翻译与本地化发布 |
| 声音品牌管家 | `podcast-brand-keeper` | `podcast` | 栏目说明、历史文案、风格偏好 | 栏目风格记忆、标题规范、shownotes 模板、禁用词 | 维护长期声音品牌 |

### 5.1 资料播客制作人

工作方式：

- 先确认节目受众、单集时长、主持人数、语气和资料范围。
- 从资料中提取核心观点、冲突点、故事线和可引用事实。
- 默认输出“双人对谈脚本”，并同时给出单人口播版本的改写建议。

产物：

- `episode-outline.md`
- `script-dialogue.md`
- `shownotes.md`
- `source-notes.md`
- `publish-copy.md`

### 5.2 访谈剪辑助理

工作方式：

- 如果输入是音频，先提示可使用 Whisper/WhisperX/pyannote 等工具生成转写和说话人信息。
- 如果输入已经是转写稿，直接清洗口癖、整理段落、标注主题和时间点。
- 保留原意，不把访谈内容改写成未经确认的新事实。

产物：

- `transcript-clean.md`
- `chapters.md`
- `highlights.md`
- `edit-decisions.csv`
- `guest-quotes.md`

### 5.3 播客拆条增长助手

工作方式：

- 从一整期节目中识别适合传播的观点、争议、故事、清单和行动建议。
- 为不同平台生成不同长度和语气的文案，但不制造标题党事实。
- 给出“为什么这段值得拆”的理由，方便用户复核。

产物：

- `clip-ideas.md`
- `clips.csv`
- `social-copy.md`
- `newsletter-summary.md`

### 5.4 每日音频简报助手

工作方式：

- 适合绑定 scheduled task：每天/每周读取固定信息源，生成简报脚本。
- 强制列出来源和不确定信息，避免把传闻写成确定结论。
- 默认输出 3-5 分钟口播稿，不直接追求长节目。

产物：

- `daily-briefing-script.md`
- `sources.md`
- `risk-notes.md`
- 可选 scheduled task 模板

### 5.5 播客本地化助手

工作方式：

- 先建立术语表、人物/机构名对照和节目语气。
- 先翻译意思，再改写为中文可口播表达。
- 可输出双语字幕和中文 shownotes。

产物：

- `localized-script.md`
- `glossary.md`
- `bilingual-shownotes.md`
- `subtitles.srt`

### 5.6 声音品牌管家

工作方式：

- 重点使用 agent memory，长期记录栏目定位、主持人口吻、固定结构、禁用词、标题偏好。
- 不直接生产完整节目，而是服务其它播客 pack 的风格一致性。
- 当用户上传历史节目文案时，提炼风格手册并写入记忆。

产物：

- `brand-voice.md`
- `episode-template.md`
- `title-rules.md`
- `shownotes-template.md`

## 6. Agent Pack 元数据模型

现有 `AgentWorkspace` 的 `category` 和 `coverImage` 不足以表达“输入/输出/工具需求/示例任务”。第一版需要给内置 agent 定义扩展 pack metadata。

### 6.1 定义来源

仍使用 `sidecar/src/builtins/agents/<slug>/agent.json` 作为单一来源：

```json
{
  "slug": "podcast-research-producer",
  "name": "资料播客制作人",
  "avatar": "orange",
  "category": "podcast",
  "coverImage": "podcast",
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
        "title": "把一组资料整理成双人播客脚本",
        "prompt": "请基于这些资料，生成一期 20 分钟双人对谈播客脚本..."
      }
    ]
  }
}
```

### 6.2 sidecar 同步

`reconcileBuiltinAgents` 继续负责基础字段，同时把 `pack` 写入新的 `catalog_json` 字段。

采用字段：

- `agent_workspaces.catalog_json TEXT`

原因：

- 只服务广场展示和详情页解释，不参与运行时核心逻辑。
- 未来视频/数字人/课程 pack 可复用，不需要每个维度加列。
- 内置 pack 定义每次启动覆盖，和现有 name/avatar/mountedSkills 同一只读边界。

`AgentWorkspace` 前后端类型增加：

```ts
interface AgentCatalogMetadata {
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

用户创建的普通 agent 默认 `catalogMetadata = null`。克隆官方 pack 时不复制 `catalog_json`，克隆后的 user agent 不再作为官方 pack 展示；sample tasks 后续若要复用，应写入用户模板系统，而不是保留官方 catalog 标识。

## 7. 广场体验设计

### 7.1 分类

当前分类是 development/research/writing/automation/general。播客工作室需要新增垂直分类：

- `podcast`：播客音频生产

第一版只新增一个分类，不引入完整行业分类体系。后续可扩展：

- `video`
- `marketing`
- `education`
- `design`
- `finance`

### 7.2 Pack Card

`AgentCard` 对带 `catalogMetadata` 的官方 pack 显示增强信息：

- 标题：pack 名称
- tagline：一句话说明
- 输入 chips：PDF、链接、音频、转写稿
- 输出 chips：脚本、shownotes、SRT、剪辑清单
- 工具状态：可选工具数量与缺失提示
- 风险标签：版权、声音授权、联网、文件读写

没有 `catalogMetadata` 的普通 agent 继续走当前卡片样式，避免影响用户自建 agent。

### 7.3 Pack Detail

进入 `/agents/:id` 后，官方播客 pack 的 masthead 下方新增“Pack 能力概览”：

- 适合输入
- 预计产出
- 示例任务
- 可选工具
- 权限/版权提示

用户可点击 sample task，把 prompt 填入 composer。提交后仍创建普通 agent-bound conversation。

### 7.4 工具体检

第一版工具体检只做轻量状态，不做自动安装：

- `ffmpeg`：检查命令是否可用。
- `whisper` / `whisper.cpp` / `whisperx`：检查命令或配置路径。
- `chattts` / `fish-speech`：先作为未配置外部工具显示。

UI 状态：

- 已就绪
- 未安装
- 未配置
- 暂不支持自动检测

工具体检结果不阻止用户使用 pack；只影响是否建议音频转写/TTS路径。

sidecar 增加只读检测接口：

- `GET /tools/audio/status`

返回结构：

```ts
interface AudioToolStatus {
  ffmpeg: "ready" | "missing";
  whisper: "ready" | "missing" | "unconfigured";
  whisperx: "ready" | "missing" | "unconfigured";
  chattts: "ready" | "unconfigured" | "unsupported";
  fishSpeech: "ready" | "unconfigured" | "unsupported";
}
```

第一版只检测命令是否在 PATH 或设置中配置了可执行路径，不运行模型、不下载依赖、不写文件。

## 8. 任务与产物约定

播客 pack 需要在指令中约定产物目录结构。建议所有播客任务默认把文件放到当前 agent 工作区：

```text
output/
  podcast/
    <YYYY-MM-DD>-<episode-slug>/
      episode-outline.md
      script-dialogue.md
      shownotes.md
      publish-copy.md
      chapters.md
      clips.csv
      subtitles.srt
      sources.md
```

约定好文件名的价值：

- 右侧 Files/Preview 更容易识别产物。
- 后续 Outcome Inbox 可以按产物类型聚合。
- 用户把同一个 pack 跑多次时，不会覆盖旧节目。

第一版不新增独立 Outcome Inbox，但指令和 sample tasks 必须要求 agent 输出“产物清单”。

## 9. Skills 与工具边界

### 9.1 已有 skills

可复用现有内置技能：

- `agent-studio:pdf`
- `agent-studio:docx`
- `agent-studio:xlsx`
- `agent-studio:schedule`

播客 pack 不一定都需要 mountedSkills。建议：

- 资料播客制作人：`pdf`, `docx`
- 每日音频简报助手：`schedule`, `pdf`, `docx`
- 播客拆条增长助手：不强制挂文档技能，可继承全部启用技能
- 声音品牌管家：不强制挂文档技能，重 memory

### 9.2 后续可新增技能

本设计不要求第一版实现新技能，但预留以下方向：

- `agent-studio:audio-transcribe`：封装 Whisper/WhisperX/whisper.cpp。
- `agent-studio:audio-edit`：封装 ffmpeg 切片、格式转换、音量规范化。
- `agent-studio:podcast-publish`：导出 RSS item、shownotes、平台发布草稿。
- `agent-studio:tts-preview`：封装 ChatTTS/Fish Speech/外部 TTS 服务。

新增技能时必须遵守现有 skillRegistry id 规则：随 App 打包技能使用 `agent-studio:<name>`。

## 10. 权限、版权与安全

播客 pack 比普通写作 agent 更容易触碰版权和声音授权，所以第一版需要在广场和详情页都显示风险提示：

- 外部音频和 YouTube/播客素材可能有版权限制。
- 声音克隆、数字人和模拟主持人声音需要明确授权。
- 使用网页资料生成节目时，必须保留来源。
- 使用命令行工具处理本地音频时，会读取和写入用户选择的工作区文件。
- 自动发布不在第一版范围内，避免误发内容。

AGENT.md 中应要求：

- 不伪造嘉宾说过的话。
- 不把未经核验的信息写成事实。
- 不承诺已生成音频，除非实际工具调用成功并产出文件。
- 对版权、声音授权和来源不清的材料明确提醒用户确认。

## 11. UI 与 i18n

需要新增或调整：

- `AgentFunctionCategory` 增加 `podcast`。
- `AGENT_CATEGORY_ORDER` 增加 `podcast`，建议排序放在 `writing` 之后、`automation` 之前。
- `agent-catalog.ts` 增加 `podcast` meta 和 cover fallback。
- 新增 `/public/agent-covers/podcast.svg`，风格与现有封面一致。
- `zh/agents.json` 与 `en/agents.json` 增加播客分类、输入/输出/工具/风险文案。
- `AgentCard` 对 `catalogMetadata` 做增强展示。
- `AgentSpaceHeader` 或详情页主区域显示 Pack 能力概览。

视觉约束：

- 遵守三层 design token，不在组件中写 raw hex/HSL。
- 不使用紫色渐变、emoji 装饰 icon、过度圆角。
- 卡片信息密度提高，但不能出现 card 套 card。
- 输入/输出 chips 使用现有 token，文字必须在移动端可换行。

## 12. 测试计划

sidecar 测试：

- `BUILTIN_AGENT_DEFS` 包含 6 个 podcast pack，slug 唯一。
- 每个 podcast pack 的 `pack` 元数据完整：`tagline`、`inputTypes`、`outputTypes`、`optionalTools`、`riskTags`、`sampleTasks`。
- `reconcileBuiltinAgents` 会把 `catalog_json` 写入 DB，并在定义更新时覆盖。
- 非 pack 内置 agent 的 `catalog_json` 为 null 或合法空值。
- 克隆 pack 后生成 user agent，定义可编辑，不再被官方 catalog 覆盖。

前端测试：

- `buildAgentCategoryTabs` 支持 `podcast` 分类并计数正确。
- `filterAgentsByCategory` 可以筛选 podcast。
- `AgentCard` 对有 `catalogMetadata` 的 agent 展示 tagline、输入/输出 chips。
- Pack sample task 点击后能把 prompt 填入 composer 或触发同等预填逻辑。

验证命令：

```bash
cd sidecar && bun test
bun test src/features/agent-workspaces
bunx tsc --noEmit -p tsconfig.app.json
bun run build
```

## 13. 非目标

- 不开放社区 pack 导入。
- 不自动安装 ffmpeg、Whisper、TTS 模型或 Python 环境。
- 不把音频/TTS/视频生成模型随 App 打包。
- 不实现全自动播客发布。
- 不新增多 agent 编排引擎。
- 不改变现有 run event append-only 语义。
- 不改变内置 agent 的只读、clone、memory、folders、links 规则。

## 14. 实施顺序

1. 扩展类型与 DB：增加 `podcast` 分类和 `catalog_json` 字段。
2. 扩展内置 agent 定义类型：支持 `pack` 元数据，并同步到 DB。
3. 新增 6 个 podcast pack 目录：`agent.json` + `AGENT.md`。
4. 更新 `sidecar/src/builtins/agents/index.ts` 静态 import 清单。
5. 更新前端数据类型、agent catalog、i18n 和 podcast cover。
6. 改造 `/agents` card，让 pack 元数据可见。
7. 改造 `/agents/:id`，增加 Pack 能力概览和 sample task 入口。
8. 增加轻量工具体检接口与 UI 入口，先展示可检测状态，不自动安装。
9. 补 sidecar 与前端测试。
10. 跑完整验证命令并做手动 smoke。

## 15. 完成标准

- `/agents` 出现播客分类，且能筛选 6 个官方播客 pack。
- 每个播客 pack 的卡片能展示输入、输出、工具需求和风险标签。
- 每个播客 pack 详情页能看到能力概览和至少 3 个 sample tasks。
- 用户能从 sample task 发起一次 agent-bound conversation。
- 官方 pack 仍只读，可克隆为用户 agent。
- 没有安装音频工具时，用户仍能使用脚本、shownotes、拆条等文本生产能力。
- 测试与类型检查通过。
