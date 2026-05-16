import type { Meta, StoryObj } from "@storybook/react-vite";
import { Shimmer } from "@/components/ai-elements/shimmer";

const meta: Meta<typeof Shimmer> = {
  title: "AI Elements/Shimmer",
  component: Shimmer,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof Shimmer>;

export const Default: Story = {
  args: {
    children: "Thinking...",
  },
};

export const LongerPhrase: Story = {
  args: {
    children: "正在扫描 ~/Workspace 下的旧项目...",
  },
};

export const Heading: Story = {
  args: {
    as: "h2",
    className: "font-serif text-2xl",
    children: "Generating report",
  },
};

export const SlowSweep: Story = {
  args: {
    children: "Loading context",
    duration: 4,
  },
};

export const MultiLineStack: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Shimmer>Reading file tree...</Shimmer>
      <Shimmer>Indexing dependencies...</Shimmer>
      <Shimmer>Summarizing findings...</Shimmer>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Shimmer>Thinking...</Shimmer>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <Shimmer>Thinking...</Shimmer>
      </div>
    </div>
  ),
};
