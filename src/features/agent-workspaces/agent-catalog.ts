import type {
  AgentCoverImage,
  AgentFunctionCategory,
  AgentWorkspace,
} from "@/lib/data/types";

export const AGENT_CATEGORY_ORDER = [
  "development",
  "research",
  "writing",
  "podcast",
  "automation",
  "general",
] as const satisfies readonly AgentFunctionCategory[];

const CATEGORY_SET = new Set<string>(AGENT_CATEGORY_ORDER);
const COVER_SET = new Set<string>(AGENT_CATEGORY_ORDER);
const CATEGORY_ALIASES: Record<string, AgentFunctionCategory> = {
  "开发构建": "development",
  "研究分析": "research",
  "内容写作": "writing",
  "播客音频": "podcast",
  "自动化执行": "automation",
  "通用助手": "general",
};

export type AgentCategoryTabId = "all" | AgentFunctionCategory;

export interface AgentCategoryMeta {
  labelKey: string;
  descriptionKey: string;
}

export interface AgentCategoryTab {
  id: AgentCategoryTabId;
  labelKey: string;
  descriptionKey: string;
  coverImage: AgentCoverImage;
  count: number;
}

export const AGENT_ALL_CATEGORY_META: AgentCategoryMeta = {
  labelKey: "agents.categories.all",
  descriptionKey: "agents.categoryDescriptions.all",
};

export const AGENT_CATEGORY_META: Record<AgentFunctionCategory, AgentCategoryMeta> = {
  development: {
    labelKey: "agents.categories.development",
    descriptionKey: "agents.categoryDescriptions.development",
  },
  research: {
    labelKey: "agents.categories.research",
    descriptionKey: "agents.categoryDescriptions.research",
  },
  writing: {
    labelKey: "agents.categories.writing",
    descriptionKey: "agents.categoryDescriptions.writing",
  },
  podcast: {
    labelKey: "agents.categories.podcast",
    descriptionKey: "agents.categoryDescriptions.podcast",
  },
  automation: {
    labelKey: "agents.categories.automation",
    descriptionKey: "agents.categoryDescriptions.automation",
  },
  general: {
    labelKey: "agents.categories.general",
    descriptionKey: "agents.categoryDescriptions.general",
  },
};

export function normalizeAgentCategory(raw: unknown): AgentFunctionCategory {
  if (typeof raw !== "string") return "general";
  if (CATEGORY_SET.has(raw)) return raw as AgentFunctionCategory;
  return CATEGORY_ALIASES[raw.trim()] ?? "general";
}

export function coverImageForAgent(agent: Pick<AgentWorkspace, "category" | "coverImage">): AgentCoverImage {
  const category = normalizeAgentCategory(agent.category);
  return typeof agent.coverImage === "string" && COVER_SET.has(agent.coverImage)
    ? (agent.coverImage as AgentCoverImage)
    : category;
}

export function agentCoverSrc(coverImage: AgentCoverImage): string {
  return `/agent-covers/${coverImage}.svg`;
}

export function buildAgentCategoryTabs(agents: AgentWorkspace[]): AgentCategoryTab[] {
  const counts = new Map<AgentFunctionCategory, number>();
  for (const agent of agents) {
    const category = normalizeAgentCategory(agent.category);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [
    {
      id: "all",
      labelKey: AGENT_ALL_CATEGORY_META.labelKey,
      descriptionKey: AGENT_ALL_CATEGORY_META.descriptionKey,
      coverImage: "general",
      count: agents.length,
    },
    ...AGENT_CATEGORY_ORDER.map((category) => ({
      id: category,
      labelKey: AGENT_CATEGORY_META[category].labelKey,
      descriptionKey: AGENT_CATEGORY_META[category].descriptionKey,
      coverImage: category,
      count: counts.get(category) ?? 0,
    })),
  ];
}

export function filterAgentsByCategory(
  agents: AgentWorkspace[],
  activeCategory: AgentCategoryTabId,
): AgentWorkspace[] {
  if (activeCategory === "all") return agents;
  return agents.filter((agent) => normalizeAgentCategory(agent.category) === activeCategory);
}
