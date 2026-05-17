import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  PluginCategoryChips,
  CATEGORIES,
  type Category,
} from "@/features/customize/PluginCategoryChips";

const meta: Meta<typeof PluginCategoryChips> = {
  title: "Features/Customize/PluginCategoryChips",
  component: PluginCategoryChips,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PluginCategoryChips>;

function Interactive({ initial = "all" as Category }: { initial?: Category }) {
  const [active, setActive] = useState<Category>(initial);
  return <PluginCategoryChips active={active} onChange={setActive} />;
}

export const Default: Story = {
  render: () => <Interactive />,
};

export const EachCategoryActive: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "2rem",
        background: "hsl(var(--bg-100))",
        minHeight: "100vh",
      }}
    >
      {CATEGORIES.map((c) => (
        <PluginCategoryChips key={c} active={c} onChange={() => {}} />
      ))}
    </div>
  ),
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        minHeight: "100vh",
      }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <Interactive initial="productivity" />
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
      >
        <Interactive initial="productivity" />
      </div>
    </div>
  ),
};
