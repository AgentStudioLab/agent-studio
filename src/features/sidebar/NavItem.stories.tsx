import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, FolderOpen, Clock, Sparkles } from "lucide-react";
import { NavItem } from "@/features/sidebar/NavItem";

const meta: Meta<typeof NavItem> = {
  title: "Features/Sidebar/NavItem",
  component: NavItem,
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
type Story = StoryObj<typeof NavItem>;

export const Default: Story = {
  args: { icon: Plus, label: "New task" },
};

export const Active: Story = {
  args: { icon: FolderOpen, label: "Projects", active: true },
};

export const AllFour: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <NavItem icon={Plus} label="New task" />
      <NavItem icon={FolderOpen} label="Projects" />
      <NavItem icon={Clock} label="Scheduled" />
      <NavItem icon={Sparkles} label="Customize" />
    </div>
  ),
};
