import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserBar } from "@/features/sidebar/UserBar";

const meta: Meta<typeof UserBar> = {
  title: "Features/Sidebar/UserBar",
  component: UserBar,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }} className="bg-sidebar text-sidebar-foreground p-2 rounded-md">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof UserBar>;

export const SignedOut: Story = {
  args: {
    signedIn: false,
    onLogin: () => console.log("login"),
    onSettings: () => console.log("settings"),
    onLogout: () => console.log("logout"),
  },
};

export const SignedInWithCredits: Story = {
  args: {
    signedIn: true,
    name: "Ada Lovelace",
    email: "ada@example.test",
    credits: 42,
    onSettings: () => console.log("settings"),
    onLogout: () => console.log("logout"),
  },
};

export const Loading: Story = {
  args: {
    signedIn: false,
    loading: true,
  },
};
