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

export const Default: Story = {
  args: { skill, active: false },
};

export const Active: Story = {
  args: { skill, active: true },
};

export const Expanded: Story = {
  args: {
    skill,
    active: true,
    expanded: true,
    childFiles: [
      "SKILL.md",
      "agents/",
      "assets/",
      "eval-viewer/",
      "references/",
      "scripts/",
      "LICENSE.txt",
    ],
  },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ width: 320 }}>
          <SkillCard
            skill={skill}
            active
            expanded
            childFiles={["SKILL.md", "agents/", "assets/"]}
          />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
      >
        <div style={{ width: 320 }}>
          <SkillCard
            skill={skill}
            active
            expanded
            childFiles={["SKILL.md", "agents/", "assets/"]}
          />
        </div>
      </div>
    </div>
  ),
};
