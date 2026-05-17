import type { MockRecentItem } from "./types";

export const recents: MockRecentItem[] = [
  {
    id: "recent-1",
    kind: "task",
    title: "扫描 ~/Workspace 找出不活跃项目",
    status: "active",
    time: "now",
  },
  {
    id: "recent-2",
    kind: "conversation",
    title: "Tauri sidecar 端口分发方案",
    time: "2 hours ago",
  },
  {
    id: "recent-3",
    kind: "task",
    title: "生成 Q3 市场研究简报 PPT",
    status: "done",
    time: "yesterday",
  },
  {
    id: "recent-4",
    kind: "task",
    title: "整理 5 月对账单 + ETF 再平衡建议",
    status: "done",
    time: "yesterday",
  },
  {
    id: "recent-5",
    kind: "conversation",
    title: "周更博客标题候选打磨",
    time: "2 days ago",
  },
  {
    id: "recent-6",
    kind: "task",
    title: "批量回复 BOSS 直聘 12 个候选人",
    status: "pending",
    time: "3 days ago",
  },
  {
    id: "recent-7",
    kind: "task",
    title: "拉取 CI 失败日志并归档",
    status: "failed",
    time: "3 days ago",
  },
  {
    id: "recent-8",
    kind: "conversation",
    title: "shadcn radix-nova 主题接入",
    time: "last week",
  },
  {
    id: "recent-9",
    kind: "conversation",
    title: "竞品功能矩阵 v2",
    time: "last week",
  },
  {
    id: "recent-10",
    kind: "task",
    title: "周报：本周完成 + 下周三件大事",
    status: "done",
    time: "last week",
  },
];
