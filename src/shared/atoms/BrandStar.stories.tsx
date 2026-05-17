import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrandStar } from "@/shared/atoms/BrandStar";

const meta: Meta<typeof BrandStar> = {
  title: "Atoms/BrandStar",
  component: BrandStar,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof BrandStar>;

export const Default: Story = {};

export const Spinning: Story = { args: { spinning: true } };

export const Large: Story = { args: { size: 48 } };

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <BrandStar size={16} />
      <BrandStar size={24} />
      <BrandStar size={32} />
      <BrandStar size={48} />
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <BrandStar size={32} />
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <BrandStar size={32} />
      </div>
    </div>
  ),
};
