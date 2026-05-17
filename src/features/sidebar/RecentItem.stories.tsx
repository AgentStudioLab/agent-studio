import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecentItem } from "@/features/sidebar/RecentItem";

const meta: Meta<typeof RecentItem> = {
  title: "Features/Sidebar/RecentItem",
  component: RecentItem,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }} className="bg-sidebar text-sidebar-foreground p-2 rounded-md">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof RecentItem>;

export const ActiveTask: Story = {
  args: {
    item: {
      id: "r1",
      kind: "task",
      title: "扫描 ~/Workspace 找出不活跃项目",
      status: "active",
      time: "now",
    },
  },
};

export const DoneTask: Story = {
  args: {
    item: {
      id: "r2",
      kind: "task",
      title: "生成 Q3 市场研究简报 PPT",
      status: "done",
      time: "yesterday",
    },
  },
};

export const Conversation: Story = {
  args: {
    item: {
      id: "r3",
      kind: "conversation",
      title: "Tauri sidecar 端口分发方案",
      time: "2 hours ago",
    },
  },
};

export const Hover: Story = {
  render: () => (
    <div className="flex flex-col gap-1 bg-sidebar-accent rounded-md">
      <RecentItem
        item={{
          id: "r1",
          kind: "task",
          title: "扫描 ~/Workspace（hover 状态）",
          status: "active",
          time: "now",
        }}
      />
    </div>
  ),
};
