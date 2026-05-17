import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PluginsBody } from "@/features/customize/PluginsBody";

const meta: Meta<typeof PluginsBody> = {
  title: "Features/Customize/PluginsBody",
  component: PluginsBody,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", display: "flex" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PluginsBody>;

export const Default: Story = {};

/**
 * Demonstrates the Productivity-filtered state by clicking the Productivity chip
 * after mount. Keeps PluginsBody fully encapsulated (no prop-drilling).
 */
function ProductivityFilteredHarness() {
  useEffect(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const target = buttons.find((b) => b.textContent === "Productivity");
    target?.click();
  }, []);
  return <PluginsBody />;
}

export const ProductivityFiltered: Story = {
  render: () => <ProductivityFilteredHarness />,
};

export const SideBySide: Story = {
  decorators: [],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", background: "hsl(var(--bg-100))" }}>
        <PluginsBody />
      </div>
      <div
        data-mode="dark"
        style={{ display: "flex", background: "hsl(var(--bg-100))" }}
      >
        <PluginsBody />
      </div>
    </div>
  ),
};
