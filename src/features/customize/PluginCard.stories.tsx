import type { Meta, StoryObj } from "@storybook/react-vite";
import { PluginCard } from "@/features/customize/PluginCard";
import { plugins } from "@/lib/mock/plugins";

const meta: Meta<typeof PluginCard> = {
  title: "Features/Customize/PluginCard",
  component: PluginCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PluginCard>;

const notInstalled = plugins.find((p) => !p.installed)!;
const installed = plugins.find((p) => p.installed)!;
const longestDescription = plugins.reduce((a, b) =>
  b.description.length > a.description.length ? b : a,
);

export const Default: Story = {
  args: { plugin: notInstalled },
};

export const Installed: Story = {
  args: { plugin: installed },
};

export const LongDescription: Story = {
  args: { plugin: longestDescription },
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          {plugins.map((p) => (
            <PluginCard key={p.id} plugin={p} />
          ))}
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 16,
          }}
        >
          {plugins.map((p) => (
            <PluginCard key={p.id} plugin={p} />
          ))}
        </div>
      </div>
    </div>
  ),
};
