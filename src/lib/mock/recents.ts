import type { MockRecentItem } from "./types";

/**
 * Prototype HTML 636-645:
 *   running / done / idle / idle / scheduled / scheduled / failed / idle
 * Mirrors that mix so all five StatusDot variants exercise.
 */
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
    kind: "task",
    title: "Daily briefing · today",
    status: "done",
    time: "10 minutes ago",
  },
  {
    id: "recent-3",
    kind: "conversation",
    title: "Tauri sidecar 端口分发方案",
    time: "2 hours ago",
  },
  {
    id: "recent-4",
    kind: "conversation",
    title: "周更博客标题候选打磨",
    time: "2 days ago",
  },
  {
    id: "recent-5",
    kind: "task",
    title: "New scheduled task",
    status: "scheduled",
    time: "—",
  },
  {
    id: "recent-6",
    kind: "task",
    title: "Inbox triage · 每天 18:00",
    status: "scheduled",
    time: "—",
  },
  {
    id: "recent-7",
    kind: "task",
    title: "Refactor huashu-design plugins",
    status: "failed",
    time: "3 days ago",
  },
  {
    id: "recent-8",
    kind: "conversation",
    title: "shadcn radix-nova 主题接入",
    time: "last week",
  },
];
