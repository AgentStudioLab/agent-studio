import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProcessTab } from "@/features/task/ProcessTab";
import { inactiveProjectsTask, makeMockTask } from "@/lib/mock/task";

const meta: Meta<typeof ProcessTab> = {
  title: "Features/Task/ProcessTab",
  component: ProcessTab,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 400, background: "hsl(var(--bg-100))" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ProcessTab>;

export const Running: Story = {
  args: { task: inactiveProjectsTask },
};

export const Done: Story = {
  args: {
    task: makeMockTask({
      status: "done",
      elapsedSeconds: 287,
      plan: inactiveProjectsTask.plan.map((p) => ({
        ...p,
        status: "done" as const,
      })),
    }),
  },
};

export const Failed: Story = {
  args: {
    task: makeMockTask({
      status: "failed",
      elapsedSeconds: 42,
      plan: [
        { id: "p1", status: "done", description: "扫描 ~/Workspace 目录" },
        { id: "p2", status: "failed", description: "按最后 git commit 时间排序" },
        { id: "p3", status: "pending", description: "生成 xlsx 报表" },
      ],
    }),
  },
};

export const Paused: Story = {
  args: { task: makeMockTask({ status: "paused", elapsedSeconds: 75 }) },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1rem",
        padding: "1rem",
      }}
    >
      <div
        style={{ width: 320, height: 400, background: "hsl(var(--bg-100))" }}
      >
        <ProcessTab task={inactiveProjectsTask} />
      </div>
      <div
        data-mode="dark"
        style={{ width: 320, height: 400, background: "hsl(var(--bg-100))" }}
      >
        <ProcessTab task={inactiveProjectsTask} />
      </div>
    </div>
  ),
};
