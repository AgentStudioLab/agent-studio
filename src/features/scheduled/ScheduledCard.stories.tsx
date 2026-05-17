import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScheduledCard } from "@/features/scheduled/ScheduledCard";
import { scheduledTasks } from "@/lib/mock/scheduled";

const meta: Meta<typeof ScheduledCard> = {
  title: "Features/Scheduled/ScheduledCard",
  component: ScheduledCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ScheduledCard>;

export const Default: Story = {
  args: { task: scheduledTasks[0] },
};

export const LongDescription: Story = {
  args: {
    task: {
      ...scheduledTasks[0],
      name: "扫描整个工作区生成多维度长报告",
      description:
        "每天扫描 ~/Workspace 下所有项目，按活跃度、最近提交、未关闭 PR、CI 状态等维度生成一个超长的 markdown 报告，写入 ~/Documents/notes/workspace-digest.md 并按周归档。这个描述很长，用于测试 line-clamp 行为。",
    },
  },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ width: 360 }}>
          <ScheduledCard task={scheduledTasks[0]} />
        </div>
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ width: 360 }}>
          <ScheduledCard task={scheduledTasks[0]} />
        </div>
      </div>
    </div>
  ),
};
