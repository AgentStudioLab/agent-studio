import type { MockScheduledTask } from "./types";

export const scheduledTasks: MockScheduledTask[] = [
  {
    id: "sched-daily-brief",
    name: "Daily brief",
    description:
      "每天早上汇总未读邮件、当日日程、未处理的 GitHub 提醒，输出一条 200 字以内的简报。",
    prompt:
      "汇总以下三类信息：1) 过去 24 小时收到的、还没回复的邮件标题 + 发件人；2) 今天 9:00–18:00 的日程；3) 我作为 reviewer 还没动的 GitHub PR。输出 markdown，控制在 200 字以内，按重要度排序。",
    frequency: "daily",
    timeOfDay: "09:00",
    nextRun: "tomorrow at ~9:00",
    active: true,
    alwaysAllowed: [
      "gmail: list-unread",
      "calendar: list-events",
      "github: list-prs",
    ],
  },
  {
    id: "sched-weekly-review",
    name: "Weekly review",
    description:
      "每周日晚 21:00 汇总本周完成项、未完成项、下周三件大事，落到 notes 项目下的 weekly.md。",
    prompt:
      "把本周的 todo 完成状况和未完成项整理出来，结合周报往期写法，输出下周的 3 件大事。写入 ~/Documents/notes/weekly.md。",
    frequency: "weekly",
    timeOfDay: "21:00",
    nextRun: "Sunday at ~21:00",
    active: true,
    alwaysAllowed: ["filesystem: write ~/Documents/notes/"],
  },
  {
    id: "sched-email-triage",
    name: "Email triage",
    description:
      "工作日中午 12:30 扫描 inbox，把可以直接归档的批量归档，需要回复的列出来。",
    prompt:
      "扫描 Gmail 主收件箱，按以下规则处理：营销邮件直接归档；订阅 newsletter 标签后归档；其它输出一个待回复列表，附 1 行摘要。",
    frequency: "weekdays",
    timeOfDay: "12:30",
    nextRun: "Monday at ~12:30",
    active: true,
    alwaysAllowed: ["gmail: list-inbox", "gmail: archive", "gmail: label"],
  },
  {
    id: "sched-resume-digest",
    name: "Resume digest",
    description:
      "每天 18:00 把当天投递的简历按四个维度打分，输出一个表格，新增简历高亮。",
    prompt:
      "读取 ~/Documents/recruiting/inbox/ 下今天新增的 PDF 简历，按 React 深度 / TypeScript / 设计审美 / 沟通四个维度打分（1-5），输出 markdown 表格。",
    frequency: "daily",
    timeOfDay: "18:00",
    nextRun: "today at 18:00",
    active: false,
  },
  {
    id: "sched-hourly-watch",
    name: "Hourly repo watch",
    description:
      "每小时扫一次 agent-studio 仓库的 CI 状态，失败就推一条 macOS 通知。",
    prompt:
      "调用 GitHub API 拉取 agent-studio 仓库最近一次 workflow run 的状态，如果是 failed 或 cancelled，触发本地通知并把日志摘要写到 ~/Documents/notes/ci-failures.md。",
    frequency: "hourly",
    nextRun: "in 38 minutes",
    active: false,
    alwaysAllowed: ["github: list-runs"],
  },
];
