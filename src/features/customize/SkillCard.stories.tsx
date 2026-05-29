import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkillCard } from "@/features/customize/SkillCard";
import { loadedSkills } from "@/lib/mock/skills";

const meta: Meta<typeof SkillCard> = {
  title: "Features/Customize/SkillCard",
  component: SkillCard,
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
type Story = StoryObj<typeof SkillCard>;

const skill = loadedSkills[0]!;
const skillArgs = {
  initials: skill.initials,
  hue: "orange" as const,
  name: skill.name,
  description: skill.description,
};

export const Default: Story = {
  args: { ...skillArgs, active: false },
};

export const Active: Story = {
  args: { ...skillArgs, active: true },
};

export const WithSourcePath: Story = {
  args: {
    ...skillArgs,
    active: true,
    sourcePath: "/Users/demo/.agent-studio/skills/filesystem",
  },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ width: 320 }}>
          <SkillCard {...skillArgs} active />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
      >
        <div style={{ width: 320 }}>
          <SkillCard
            {...skillArgs}
            active
            sourcePath="/Users/demo/.agent-studio/skills/filesystem"
          />
        </div>
      </div>
    </div>
  ),
};
