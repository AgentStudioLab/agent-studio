import type { MockAgent } from "./types";

export const agents: MockAgent[] = [
  {
    id: "agent-computer-keeper",
    emoji: "🖥️",
    name: "电脑管家智能体",
    description:
      "扫描磁盘、识别冗余文件、给出清理建议，并生成可执行的归档计划。",
    systemPrompt:
      "你是用户的电脑管家。重点关注：磁盘占用、重复文件、长期未访问的目录。任何删除操作前必须列出清单等待用户确认。",
    skills: ["filesystem", "disk-analyzer", "xlsx", "cleanup-advisor"],
    mcpServers: ["filesystem"],
    allowedProjects: ["proj-jay"],
    category: "my",
  },
  {
    id: "agent-office",
    emoji: "💼",
    name: "办公智能体",
    description:
      "处理邮件、日历、PPT、Word、Excel 的日常事务，写作语气贴近用户。",
    systemPrompt:
      "你是用户的办公助手。生成文档时模仿用户既有文件的语气和段落结构。涉及外发邮件必须先呈现草稿。",
    skills: ["gmail", "calendar", "pptx", "docx", "xlsx"],
    mcpServers: ["gmail", "filesystem"],
    allowedProjects: ["proj-recruiting", "proj-research"],
    category: "my",
  },
  {
    id: "agent-research",
    emoji: "🔍",
    name: "研究助手",
    description:
      "在 web 和本地 PDF 之间穿梭，引用必带链接和发布时间，输出结构化摘要。",
    systemPrompt:
      "你是研究助手。任何论断都必须带可追溯来源；引用的 URL 必须确认可访问；摘要先给结论再给依据。",
    skills: ["web-search", "pdf-reader", "citation", "summarize"],
    mcpServers: ["filesystem"],
    allowedProjects: ["proj-research", "proj-writing"],
    category: "my",
  },
  {
    id: "agent-design",
    emoji: "🎨",
    name: "设计助手",
    description:
      "对接 Figma 与内部 huashu-design 系统，把需求转换成组件草图与 token 引用。",
    systemPrompt:
      "你是设计助手。所有颜色、间距、圆角必须引用 design token 而不是 hex；草图输出 SVG 或 Figma plugin payload。",
    skills: ["huashu-design", "figma"],
    mcpServers: [],
    allowedProjects: "all",
    category: "built-in",
  },
  {
    id: "agent-writing",
    emoji: "✍️",
    name: "写作助手",
    description:
      "把零散笔记打磨成有节奏的中文长文，保留作者已有的语气和句长。",
    systemPrompt:
      "你是中文写作助手。优先短句、口语化连接词、避免感叹号；技术段落放折叠块；段首 2 句话决定读者去留。",
    skills: ["markdown", "writing-style"],
    mcpServers: [],
    allowedProjects: "all",
    category: "built-in",
  },
  {
    id: "agent-data-analyst",
    emoji: "📊",
    name: "数据分析师",
    description:
      "读 Excel 与 CSV，跑 pandas，输出图表与决策摘要，结论先于数字。",
    systemPrompt:
      "你是数据分析师。先回答业务问题，再给数据；图表用 plotly；任何统计结论必须标注样本量与置信度。",
    skills: ["xlsx", "pandas", "plotly"],
    mcpServers: ["filesystem"],
    allowedProjects: "all",
    category: "built-in",
  },
];
