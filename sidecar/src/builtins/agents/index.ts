// 内置(官方只读预置)智能体清单 —— 手维护。
//
// 编译期约束：sidecar 经 `bun build --compile` 打成单二进制，运行时磁盘上没有这些
// 源文件，所以 agent.json 与 AGENT.md 都必须在这里被【静态 import】嵌进二进制，
// 不能 fs 扫描、也不能用 JSON 里的路径字符串做动态 import。AGENT.md 用
// `with { type: "text" }` 文本 import（bun run / build --compile / tsc 三关均已验证）。
//
// 新增一个内置 agent：建 `<slug>/{agent.json,AGENT.md}` + 在下面加两行 import 和一行清单。
// 详见 docs/superpowers/specs/2026-06-18-builtin-agents-design.md。

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

export interface BuiltinAgentDef {
  /** 稳定标识，决定 id = `agw_builtin_<slug>`。改 slug 等于换一个 agent（旧的会被软下架）。 */
  slug: string;
  name: string;
  /** 色调 token（orange|blue|purple|red|green|amber|stone）或省略 → null。 */
  avatar?: string | null;
  /** 功能分类，用于智能体列表页的功能 tab。省略 → general。 */
  category?: string | null;
  /** 本地封面资产 id。省略或非法 → category 对应封面。 */
  coverImage?: string | null;
  /** 三态：省略/null=继承全部启用技能；[]=显式不挂；数组=显式子集。 */
  mountedSkills?: string[] | null;
  /** 来自同目录 AGENT.md 的指令正文（编译期注入），reconcile 时落成 homeDir/CLAUDE.md。 */
  instructions: string;
}

export const BUILTIN_AGENT_DEFS: BuiltinAgentDef[] = [
  { ...codingMeta, instructions: codingMd },
  { ...codeReviewerMeta, instructions: codeReviewerMd },
  { ...researchMeta, instructions: researchMd },
  { ...writingMeta, instructions: writingMd },
  { ...presentationMeta, instructions: presentationMd },
  { ...spreadsheetMeta, instructions: spreadsheetMd },
  { ...automationMeta, instructions: automationMd },
];
