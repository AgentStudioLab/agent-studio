import type { MockPinnedItem } from "./types";

export const pinned: MockPinnedItem[] = [
  {
    id: "proj-jay",
    kind: "project",
    name: "jay",
  },
  {
    id: "proj-research",
    kind: "project",
    name: "Q3 市场研究",
  },
  {
    id: "recent-1",
    kind: "task",
    name: "扫描 ~/Workspace 找出不活跃项目",
    status: "active",
  },
  {
    id: "pinned-weekly",
    kind: "task",
    name: "Weekly review",
    status: "done",
  },
];
