import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSegment } from "@/shared/atoms/ThemeSegment";

const meta: Meta<typeof ThemeSegment> = {
  title: "Atoms/ThemeSegment",
  component: ThemeSegment,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof ThemeSegment>;

export const Default: Story = {};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <ThemeSegment />
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <ThemeSegment />
      </div>
    </div>
  ),
};
