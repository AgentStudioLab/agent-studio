import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskHeader } from "@/features/task/TaskHeader";

const meta: Meta<typeof TaskHeader> = {
  title: "Features/Task/TaskHeader",
  component: TaskHeader,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof TaskHeader>;

const LONG_TITLE =
  "扫描 ~/Workspace 找出不活跃项目，生成 xlsx + pptx 报表";

export const Default: Story = {
  args: { conversationId: "conv-1", title: "Untitled task" },
};

export const LongTitle: Story = {
  args: { conversationId: "conv-1", title: LONG_TITLE },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <div style={{ width: 480 }}>
          <TaskHeader conversationId="conv-1" title={LONG_TITLE} />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <div style={{ width: 480 }}>
          <TaskHeader conversationId="conv-1" title={LONG_TITLE} />
        </div>
      </div>
    </div>
  ),
};
