import type { Meta, StoryObj } from "@storybook/react-vite";
import { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";

const meta: Meta<typeof SidebarItemContextMenu> = {
  title: "Features/Sidebar/SidebarItemContextMenu",
  component: SidebarItemContextMenu,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 240 }} className="bg-sidebar text-sidebar-foreground p-3 rounded-md">
        <div className="flex items-center justify-between">
          <span className="text-sm">Sample row</span>
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SidebarItemContextMenu>;

export const PinMode: Story = {
  args: {
    pinMode: "pin",
    onPinToggle: () => console.log("pin"),
    onRename: () => console.log("rename"),
    onArchive: () => console.log("archive"),
    onDelete: () => console.log("delete"),
  },
};

export const UnpinMode: Story = {
  args: {
    pinMode: "unpin",
    onPinToggle: () => console.log("unpin"),
    onRename: () => console.log("rename"),
    onArchive: () => console.log("archive"),
    onDelete: () => console.log("delete"),
  },
};
