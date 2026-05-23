import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContextTab } from "@/features/task/ContextTab";

const meta: Meta<typeof ContextTab> = {
  title: "Features/Task/ContextTab",
  component: ContextTab,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ContextTab>;

// ContextTab now fetches capabilities via useThreadContext (sidecar call).
// Without a live sidecar, the loading/empty state renders.
export const NoThread: Story = {
  args: { threadId: null },
};
