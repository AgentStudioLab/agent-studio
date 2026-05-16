import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskRightPanel } from "@/features/task/TaskRightPanel";
import { inactiveProjectsTask } from "@/lib/mock/task";
import { workingTreeFiles } from "@/lib/mock/files";
import { loadedSkills } from "@/lib/mock/skills";
import { mcpServers } from "@/lib/mock/mcp-servers";

const meta: Meta<typeof TaskRightPanel> = {
  title: "Features/Task/TaskRightPanel",
  component: TaskRightPanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 600, background: "hsl(var(--bg-100))" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof TaskRightPanel>;

const baseArgs = {
  task: inactiveProjectsTask,
  files: workingTreeFiles,
  skills: loadedSkills,
  mcpServers: mcpServers,
};

export const Default: Story = { args: baseArgs };

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", padding: "1rem" }}>
      <div style={{ width: 320, height: 600, background: "hsl(var(--bg-100))" }}>
        <TaskRightPanel {...baseArgs} />
      </div>
      <div data-mode="dark" style={{ width: 320, height: 600, background: "hsl(var(--bg-100))" }}>
        <TaskRightPanel {...baseArgs} />
      </div>
    </div>
  ),
};
