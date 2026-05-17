import type { Meta, StoryObj } from "@storybook/react-vite";
import { PinnedItem } from "@/features/sidebar/PinnedItem";

const meta: Meta<typeof PinnedItem> = {
  title: "Features/Sidebar/PinnedItem",
  component: PinnedItem,
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
type Story = StoryObj<typeof PinnedItem>;

export const Project: Story = {
  args: {
    item: { id: "p1", kind: "project", name: "jay" },
  },
};

export const Task: Story = {
  args: {
    item: { id: "t1", kind: "task", name: "扫描 ~/Workspace 找出不活跃项目" },
  },
};

export const Hover: Story = {
  parameters: { pseudo: { hover: true } },
  render: () => (
    <div className="flex flex-col gap-1">
      <div className="group bg-sidebar-accent rounded-md">
        <PinnedItem item={{ id: "p1", kind: "project", name: "jay (hover)" }} />
      </div>
    </div>
  ),
};
