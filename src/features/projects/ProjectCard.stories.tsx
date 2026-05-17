import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectCard } from "@/features/projects/ProjectCard";
import { projects } from "@/lib/mock/projects";

const meta: Meta<typeof ProjectCard> = {
  title: "Features/Project/ProjectCard",
  component: ProjectCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ProjectCard>;

export const Default: Story = {
  args: { project: projects[0] },
};

export const WithLongName: Story = {
  args: {
    project: {
      ...projects[0],
      name: "扫描 ~/Workspace 找出不活跃项目并生成长名称报表 v2",
      lastActivity: "just now",
    },
  },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ width: 360 }}>
          <ProjectCard project={projects[0]} />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
      >
        <div style={{ width: 360 }}>
          <ProjectCard project={projects[0]} />
        </div>
      </div>
    </div>
  ),
};
