import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ScheduledTask } from "@/lib/data/types";
import type { ThreadStatusItem } from "@/lib/agui/react/useThreadStatuses";

let scheduledTasks: ScheduledTask[] = [];
let threadStatuses: ThreadStatusItem[] = [];

mock.module("@tauri-apps/plugin-dialog", () => ({
  open: mock(async () => null),
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN" },
    t: (key: string) => {
      const translations: Record<string, string> = {
        "scheduled.title": "计划任务",
        "scheduled.subtitle": "自动推进任务",
        "scheduled.subtitleSuffix": "管理定时执行。",
        "scheduled.toolbar.sort": "排序",
        "scheduled.toolbar.search": "搜索",
        "scheduled.toolbar.newTask": "新建任务",
        "scheduled.badge.awaiting": "等待用户",
        "scheduled.empty": "暂无计划任务",
        "scheduled.moreIdeas.label": "更多灵感",
        "scheduled.moreIdeas.dailyBrief": "每日简报",
        "scheduled.moreIdeas.weeklyReview": "每周回顾",
        "scheduled.detail.deleteConfirm.title": "删除计划任务",
        "scheduled.detail.deleteConfirm.description": "此操作无法撤销。",
        "scheduled.detail.deleteConfirm.cancel": "取消",
        "scheduled.detail.deleteConfirm.confirm": "删除",
        "scheduled.keepAwake.description": "让计划任务执行时保持电脑唤醒。",
        "scheduled.keepAwake.toggle": "保持唤醒",
        "scheduled.modal.save": "创建",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("react-router-dom", () => ({
  useNavigate: () => mock((_path: string) => {}),
}));

mock.module("@/app/AppShell", () => ({
  AppShell: ({ main }: { main: ReactNode }) => <>{main}</>,
}));

mock.module("@/shared/layout/PageColumn", () => ({
  PageColumn: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

mock.module("@/features/scheduled/ScheduledCard", () => ({
  ScheduledCard: ({
    task,
    needsAttention,
    needsAttentionLabel,
  }: {
    task: ScheduledTask;
    needsAttention?: boolean;
    needsAttentionLabel?: string;
  }) => (
    <article aria-label={task.name}>
      <h2>{task.name}</h2>
      {needsAttention ? <span>{needsAttentionLabel}</span> : null}
    </article>
  ),
}));

mock.module("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogAction: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

mock.module("@/lib/data/scheduled-queries", () => ({
  useCreateScheduledTaskMutation: () => ({ mutate: mock(() => {}) }),
  useDeleteScheduledTaskMutation: () => ({ mutate: mock(() => {}) }),
  useRunScheduledTaskMutation: () => ({ mutate: mock(() => {}) }),
  useScheduledTasks: () => ({ data: scheduledTasks, isLoading: false }),
  useUpdateScheduledTaskMutation: () => ({ mutate: mock(() => {}) }),
}));

mock.module("@/lib/agui/react/useThreadStatuses", () => ({
  useThreadStatuses: () => ({ data: threadStatuses }),
}));

mock.module("@/lib/models", () => ({
  useAvailableModels: () => ({
    defaultModelId: "claude-default",
    models: [],
  }),
}));

const { ScheduledListView } = require("./ScheduledListView") as typeof import("./ScheduledListView");

afterEach(() => {
  scheduledTasks = [];
  threadStatuses = [];
  cleanup();
});

afterAll(() => {
  mock.restore();
});

describe("ScheduledListView", () => {
  it("shows the awaiting badge for awaiting_user scheduled runs", () => {
    scheduledTasks = [
      {
        id: "task_1",
        name: "Daily brief",
        description: "Summarize the day",
        prompt: "brief me",
        agentWorkspaceId: null,
        workingDir: null,
        model: null,
        permissionMode: "ask",
        frequency: "daily",
        timeOfDay: "09:00",
        weekday: null,
        enabled: true,
        allowedTools: [],
        nextRunAt: null,
        lastRunAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    threadStatuses = [
      {
        threadId: "thread_1",
        title: "Daily brief run",
        lastRunId: "run_1",
        status: "awaiting_user",
        lastCursor: null,
        scheduledTaskId: "task_1",
        updatedAt: 1,
      },
    ];

    render(<ScheduledListView />);

    expect(screen.getByRole("article", { name: "Daily brief" })).toBeDefined();
    expect(screen.getByText("等待用户")).toBeDefined();
  });

  it("uses the system theme color for the new task action", () => {
    render(<ScheduledListView />);

    const newTaskButton = screen.getByRole("button", { name: "新建任务" });

    // 主题主操作必须走 primary token，避免回退成黑白反色按钮。
    expect(newTaskButton.className).toContain("bg-primary");
    expect(newTaskButton.className).toContain("text-primary-foreground");
    expect(newTaskButton.className).toContain("hover:bg-primary/90");
    expect(newTaskButton.className).not.toContain("bg-foreground");
    expect(newTaskButton.className).not.toContain("text-background");
  });
});
