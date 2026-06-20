import { describe, expect, it } from "bun:test";
import {
  AGENT_CATEGORY_ORDER,
  buildAgentCategoryTabs,
  coverImageForAgent,
  filterAgentsByCategory,
  normalizeAgentCategory,
} from "./agent-catalog";
import type { AgentWorkspace } from "@/lib/data/types";

function agent(
  id: string,
  category?: AgentWorkspace["category"] | null,
  coverImage?: AgentWorkspace["coverImage"] | null,
): AgentWorkspace {
  return {
    id,
    name: id,
    avatar: null,
    homeDir: `/tmp/${id}`,
    archived: false,
    pinned: false,
    mountedSkills: null,
    source: "user",
    category: category ?? null,
    coverImage: coverImage ?? null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("agent catalog helpers", () => {
  it("normalizes unknown or missing categories to general", () => {
    expect(normalizeAgentCategory("development")).toBe("development");
    expect(normalizeAgentCategory("开发构建")).toBe("development");
    expect(normalizeAgentCategory("研究分析")).toBe("research");
    expect(normalizeAgentCategory("unknown")).toBe("general");
    expect(normalizeAgentCategory(null)).toBe("general");
  });

  it("builds function tabs in stable order with all creation categories", () => {
    const tabs = buildAgentCategoryTabs([
      agent("writer", "writing"),
      agent("coder", "development"),
      agent("loose"),
      agent("researcher", "研究分析"),
    ]);

    expect(tabs.map((tab) => [tab.id, tab.count])).toEqual([
      ["all", 4],
      ["development", 1],
      ["research", 1],
      ["writing", 1],
      ["automation", 0],
      ["general", 1],
    ]);
    expect(tabs.slice(1).map((tab) => tab.id)).toEqual(AGENT_CATEGORY_ORDER);
  });

  it("filters by function category and keeps all tab unfiltered", () => {
    const agents = [agent("coder", "development"), agent("researcher", "research")];

    expect(filterAgentsByCategory(agents, "all").map((a) => a.id)).toEqual([
      "coder",
      "researcher",
    ]);
    expect(filterAgentsByCategory(agents, "research").map((a) => a.id)).toEqual([
      "researcher",
    ]);
  });

  it("uses the stored cover when valid and falls back to the category cover", () => {
    expect(coverImageForAgent(agent("custom", "research", "automation"))).toBe(
      "automation",
    );
    expect(coverImageForAgent(agent("fallback", "writing", "broken"))).toBe("writing");
    expect(coverImageForAgent(agent("general"))).toBe("general");
  });
});
