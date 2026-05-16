import type { Meta, StoryObj } from "@storybook/react-vite";
import { FilesTab } from "@/features/task/FilesTab";
import { workingTreeFiles } from "@/lib/mock/files";

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

export const WithFiles: Story = { args: { files: workingTreeFiles } };

export const Empty: Story = { args: { files: [] } };

export const WithNewFiles: Story = {
  args: { files: workingTreeFiles.filter((f) => f.isNew) },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1rem",
        padding: "1rem",
      }}
    >
      <div
        style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}
      >
        <FilesTab files={workingTreeFiles} />
      </div>
      <div
        data-mode="dark"
        style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}
      >
        <FilesTab files={workingTreeFiles} />
      </div>
    </div>
  ),
};
