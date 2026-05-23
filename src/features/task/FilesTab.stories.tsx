import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilesTab } from "@/features/task/FilesTab";

const meta: Meta<typeof FilesTab> = {
  title: "Features/Task/FilesTab",
  component: FilesTab,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div
        style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FilesTab>;

// FilesTab now derives file list from ChatState via useThreadFiles.
// Without a sidecar + live runtime, we render the empty state.
export const EmptyState: Story = {
  args: { state: null, workingDir: null },
};
