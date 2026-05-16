import type { MockTask } from "./types";

export const inactiveProjectsTask: MockTask = {
  id: "task-inactive-projects",
  title: "扫描 ~/Workspace 找出不活跃项目，生成 xlsx + pptx 报表",
  status: "running",
  elapsedSeconds: 133,
  plan: [
    { id: "p1", status: "done", description: "扫描 ~/Workspace 目录" },
    { id: "p2", status: "done", description: "按最后 git commit 时间排序" },
    { id: "p3", status: "active", description: "生成 xlsx 报表" },
    { id: "p4", status: "pending", description: "生成 pptx 摘要" },
  ],
  messages: [
    {
      id: "m1",
      from: "user",
      content: "扫描 ~/Workspace 找出不活跃项目，生成 xlsx + pptx 报表。",
    },
    {
      id: "m2",
      from: "assistant",
      content:
        "好的。我会先扫描你的工作目录，按最近一次 git commit 排序找出不活跃项目。",
      toolCalls: [
        {
          id: "t1",
          type: "bash",
          state: "output-available",
          input: { command: "ls -la ~/Workspace" },
          output:
            "total 32\ndrwxr-xr-x  8 user staff  256 May 16 14:00 .\ndrwxr-xr-x 24 user staff  768 May 16 13:58 ..\ndrwxr-xr-x 12 user staff  384 Feb 15  2024 old-project-1\ndrwxr-xr-x  9 user staff  288 Aug  3  2024 old-project-2\ndrwxr-xr-x 21 user staff  672 May 16 13:55 agent-studio\ndrwxr-xr-x  6 user staff  192 Jan 09  2025 sketch-tool\ndrwxr-xr-x  8 user staff  256 Mar 22  2024 legacy-dashboard\n",
        },
        {
          id: "t2",
          type: "fs-read",
          state: "output-available",
          input: { path: "~/Workspace/old-project-1/.git/HEAD" },
          output: "ref: refs/heads/main\n",
          subSteps: [{ description: "reading 7 files" }],
        },
      ],
    },
    {
      id: "m3",
      from: "user",
      content: "同时生成 xlsx 和 pptx 报表。",
    },
    {
      id: "m4",
      from: "assistant",
      content: "正在生成报表，已经处理完前 2 个文件。",
      toolCalls: [
        {
          id: "t3",
          type: "fs-write",
          state: "input-streaming",
          input: {
            path: "~/Workspace/inactive-report/Q4-report.xlsx",
          },
        },
      ],
      artifacts: [
        {
          id: "a1",
          name: "Q4-report.xlsx",
          type: "spreadsheet",
          opener: "wpsoffice",
        },
      ],
    },
    {
      id: "m5",
      from: "user",
      content: "做好之后保存到 inactive-report 目录。",
    },
    {
      id: "m6",
      from: "assistant",
      content: "已完成。两份文件都已保存到 ~/Workspace/inactive-report/。",
      artifacts: [
        {
          id: "a1",
          name: "Q4-report.xlsx",
          type: "spreadsheet",
          opener: "wpsoffice",
        },
        {
          id: "a2",
          name: "slides.pptx",
          type: "presentation",
          opener: "wpsoffice",
        },
      ],
    },
  ],
};

export function makeMockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    ...inactiveProjectsTask,
    ...overrides,
    plan: overrides.plan ?? inactiveProjectsTask.plan,
    messages: overrides.messages ?? inactiveProjectsTask.messages,
  };
}
