import { describe, expect, it } from "bun:test";
import { BUILTIN_AGENT_DEFS } from ".";

const EXPECTED_SLUGS = [
  "coding-assistant",
  "code-reviewer",
  "research-assistant",
  "writing-assistant",
  "presentation-assistant",
  "spreadsheet-analyst",
  "automation-assistant",
  "podcast-research-producer",
  "podcast-interview-editor",
  "podcast-growth-clips",
  "podcast-daily-briefing",
  "podcast-localization",
  "podcast-brand-keeper",
];

const EXPECTED_PODCAST_SLUGS = [
  "podcast-research-producer",
  "podcast-interview-editor",
  "podcast-growth-clips",
  "podcast-daily-briefing",
  "podcast-localization",
  "podcast-brand-keeper",
];

const VALID_CATEGORIES = new Set(["development", "research", "writing", "podcast", "automation", "general"]);
const VALID_COVERS = VALID_CATEGORIES;
const VALID_MOUNTED_SKILLS = new Set([
  "agent-studio:doc-coauthoring",
  "agent-studio:docx",
  "agent-studio:grill-me",
  "agent-studio:pdf",
  "agent-studio:pptx",
  "agent-studio:schedule",
  "agent-studio:skill-creator",
  "agent-studio:using-superpowers",
  "agent-studio:xlsx",
]);

describe("BUILTIN_AGENT_DEFS", () => {
  it("ships the approved seven common builtin agents in a stable order", () => {
    expect(BUILTIN_AGENT_DEFS.map((agent) => agent.slug)).toEqual(EXPECTED_SLUGS);
  });

  it("ships the first podcast studio packs with complete catalog metadata", () => {
    const podcast = BUILTIN_AGENT_DEFS.filter((agent) => agent.category === "podcast");
    expect(podcast.map((agent) => agent.slug)).toEqual(EXPECTED_PODCAST_SLUGS);

    for (const agent of podcast) {
      expect(agent.pack?.domain).toBe("audio");
      expect(agent.pack?.scenario).toBeTruthy();
      expect(agent.pack?.tagline.trim().length).toBeGreaterThan(0);
      expect(agent.pack?.inputTypes.length).toBeGreaterThanOrEqual(2);
      expect(agent.pack?.outputTypes.length).toBeGreaterThanOrEqual(3);
      expect(agent.pack?.riskTags.length).toBeGreaterThanOrEqual(1);
      expect(agent.pack?.sampleTasks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps each bundled agent definition complete and valid", () => {
    const seen = new Set<string>();

    for (const agent of BUILTIN_AGENT_DEFS) {
      expect(agent.slug).toBeTruthy();
      expect(seen.has(agent.slug)).toBe(false);
      seen.add(agent.slug);

      expect(agent.name.trim().length).toBeGreaterThan(0);
      expect(agent.instructions.trim().length).toBeGreaterThan(0);
      expect(agent.instructions).toContain("## 工作方式");
      expect(agent.instructions).toContain("## 回答");

      expect(VALID_CATEGORIES.has(agent.category ?? "general")).toBe(true);
      expect(VALID_COVERS.has(agent.coverImage ?? agent.category ?? "general")).toBe(true);

      for (const skillId of agent.mountedSkills ?? []) {
        expect(VALID_MOUNTED_SKILLS.has(skillId)).toBe(true);
      }
    }
  });
});
