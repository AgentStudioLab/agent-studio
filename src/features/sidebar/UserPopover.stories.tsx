import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserPopover } from "@/features/sidebar/UserPopover";

const meta: Meta<typeof UserPopover> = {
  title: "Features/Sidebar/UserPopover",
  component: UserPopover,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 260, height: 220 }} className="flex items-end bg-sidebar text-sidebar-foreground p-2 rounded-md">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof UserPopover>;

export const Default: Story = {
  render: () => (
    <UserPopover
      email="jay.yang@ugreen.com"
      onSettings={() => console.log("settings")}
      onLogout={() => console.log("logout")}
    >
      <button type="button" className="rounded-md border px-3 py-1.5 text-sm">
        Open user menu
      </button>
    </UserPopover>
  ),
};

export const Open: Story = {
  render: () => (
    <UserPopover
      open
      email="jay.yang@ugreen.com"
      onSettings={() => console.log("settings")}
      onLogout={() => console.log("logout")}
    >
      <button type="button" className="rounded-md border px-3 py-1.5 text-sm">
        Open user menu
      </button>
    </UserPopover>
  ),
};
