import type { MockProject } from "./types";

export const projects: MockProject[] = [
  {
    id: "proj-jay",
    name: "jay",
    lastActivity: "2 hours ago",
    instructions:
      "用中文回复。涉及代码改动时先列计划再动手。提到的文件优先用绝对路径。",
    scheduledTasks: ["sched-daily-brief", "sched-weekly-review"],
    computerContext: [
      { path: "~/Workspace/agent-studio", folderName: "agent-studio" },
      { path: "~/Documents/notes", folderName: "notes" },
    ],
    memory: [
      "用户偏好 plan-before-code 的工作流",
      "桌面端目标平台：macOS arm64 + macOS x64 + Windows x64（无 Linux）",
      "Bun 是首选 runtime，避免引入 npm/pnpm workspace",
    ],
    recentConversations: [
      {
        id: "conv-j-1",
        title: "扫描不活跃项目并生成报表",
        preview:
          "已扫描 ~/Workspace，按最近一次 git commit 时间排序，生成了 xlsx 和 pptx。",
        time: "2 hours ago",
      },
      {
        id: "conv-j-2",
        title: "Tauri sidecar 接 Bun runtime",
        preview:
          "梳理了 sidecar 端口/token 分发流程，确认 capability 用 shell:allow-spawn。",
        time: "yesterday",
      },
      {
        id: "conv-j-3",
        title: "shadcn radix-nova 主题接入",
        preview:
          "把 components.json 切到 radix-nova style，对齐了 globals 中的 token 链。",
        time: "3 days ago",
      },
      {
        id: "conv-j-4",
        title: "Wave 4 view 拆分讨论",
        preview:
          "确认 7 个剩余 view 的子组件边界，Sidebar 拆 7 个文件，CustomizeView 全屏接管。",
        time: "last week",
      },
    ],
  },
  {
    id: "proj-research",
    name: "Q3 市场研究",
    lastActivity: "yesterday",
    instructions:
      "聚焦消费级 AI 工具市场，引用必须带原始链接和发布时间。",
    scheduledTasks: ["sched-email-triage"],
    computerContext: [
      { path: "~/Documents/research/Q3", folderName: "Q3" },
    ],
    memory: [
      "目标读者是非技术管理层，避免行话",
      "优先引用近 90 天的数据",
    ],
    recentConversations: [
      {
        id: "conv-r-1",
        title: "竞品功能矩阵 v2",
        preview:
          "整理了 ChatGPT / Claude / Gemini 在桌面端的差异点，输出到 matrix.xlsx。",
        time: "yesterday",
      },
      {
        id: "conv-r-2",
        title: "国内 AI 助手用户访谈纪要",
        preview:
          "归纳了 12 位访谈对象在隐私、价格、本地化方面的主要诉求。",
        time: "2 days ago",
      },
      {
        id: "conv-r-3",
        title: "Pricing benchmark 草稿",
        preview:
          "对照 8 家产品的订阅档位，输出 markdown 表格 + 估值假设。",
        time: "4 days ago",
      },
    ],
  },
  {
    id: "proj-writing",
    name: "周更博客",
    lastActivity: "3 days ago",
    instructions:
      "保留我的语气：短句，少用感叹号，技术细节放在段尾的折叠块。",
    computerContext: [
      { path: "~/Documents/blog", folderName: "blog" },
    ],
    memory: [
      "已发布主题：sidecar 架构、Tauri v2 capability、Bun build --compile",
      "目标频率：每周一发，周日晚定稿",
    ],
    recentConversations: [
      {
        id: "conv-w-1",
        title: "Tauri sidecar 文章大纲",
        preview:
          "确定 3 个章节：为什么不用 IPC / 端口和 token 怎么分发 / 退出时如何清理子进程。",
        time: "3 days ago",
      },
      {
        id: "conv-w-2",
        title: "Bun vs Node 工具链对比的草稿",
        preview: "提炼出 5 个让我从 Node 切到 Bun 的具体场景。",
        time: "last week",
      },
      {
        id: "conv-w-3",
        title: "标题候选打磨",
        preview: "10 个候选标题中筛了 3 个，A/B 决定用第二个。",
        time: "last week",
      },
    ],
  },
  {
    id: "proj-recruiting",
    name: "招聘 - 前端工程师",
    lastActivity: "last week",
    instructions:
      "候选人评估按四个维度打分：React 深度、TypeScript、设计审美、沟通。",
    scheduledTasks: ["sched-resume-digest"],
    memory: [
      "本轮目标：1 个高级前端 + 1 个全栈",
      "总预算上限 65w，候选人坐标偏好 Hangzhou / Shanghai",
    ],
    recentConversations: [
      {
        id: "conv-h-1",
        title: "JD 改稿 v3",
        preview:
          "调整了职责描述，加了 Tauri / Bun 字样以筛选目标人群。",
        time: "last week",
      },
      {
        id: "conv-h-2",
        title: "BOSS 直聘批量回复模板",
        preview: "针对三类候选人写了三套首消模板。",
        time: "last week",
      },
      {
        id: "conv-h-3",
        title: "面试题库整理",
        preview: "把 React 19 / TS 高级题各筛 8 道，标注预期答题时长。",
        time: "2 weeks ago",
      },
    ],
  },
  {
    id: "proj-finance",
    name: "个人理财",
    lastActivity: "2 weeks ago",
    instructions: "金额一律换算成人民币，资产快照按月初对齐。",
    computerContext: [
      { path: "~/Documents/finance", folderName: "finance" },
    ],
    memory: [
      "三个核心账户：招商 / 富途 / 支付宝余额宝",
      "每月 5 号生成上月结算",
    ],
    recentConversations: [
      {
        id: "conv-f-1",
        title: "5 月对账单",
        preview:
          "总资产环比 +1.2%，主要来自富途持仓回升；现金流支出符合预算。",
        time: "2 weeks ago",
      },
      {
        id: "conv-f-2",
        title: "ETF 持仓再平衡建议",
        preview: "纳指占比偏高 6 个点，建议下月分两次减仓。",
        time: "3 weeks ago",
      },
      {
        id: "conv-f-3",
        title: "信用卡积分换算",
        preview: "把三张卡的积分按当前商城价折现成人民币。",
        time: "last month",
      },
    ],
  },
  {
    id: "proj-home",
    name: "家庭与日常",
    lastActivity: "last month",
    instructions: "提到孩子时用「囡囡」代称，避免直接写名字。",
    memory: [
      "囡囡 4 岁，过敏原：芒果、虾",
      "家庭医生联系电话存在 1Password 的 Family vault",
    ],
    recentConversations: [
      {
        id: "conv-hm-1",
        title: "周末出游候选",
        preview:
          "筛了 3 个 1 小时车程内的亲子目的地，附停车 + 餐厅信息。",
        time: "last month",
      },
      {
        id: "conv-hm-2",
        title: "家庭采购清单",
        preview: "整合了三个超市 App 的购物车，输出一张对比表。",
        time: "last month",
      },
    ],
  },
];
