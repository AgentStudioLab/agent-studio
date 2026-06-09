import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listConversations } from "@/lib/data/conversations";
import { listScheduledTasks } from "@/lib/data/scheduled";
import { listAgentWorkspaces } from "@/lib/data/agents";
import { useSkills } from "@/lib/agui/react/useSkills";

/** 可搜索实体的四个类别。注意本仓库里「项目」与「agent」共用 agent_workspaces，
 *  因此合并为一个 `agent` 类别。 */
export type SearchResultType = "conversation" | "scheduled" | "agent" | "skill";

export interface SearchResult {
  /** 同一类别内稳定的 id —— 同时用作 React key 与 cmdk value（会加上类别前缀）。 */
  id: string;
  type: SearchResultType;
  /** 列表里展示的主标题。 */
  title: string;
  /** 选中后跳转的路由。技能没有详情页，统一落到 /skills 列表。 */
  route: string;
  /** epoch ms —— 驱动右侧的相对时间标签（对话 / 定时 / 智能体）。 */
  updatedAt?: number;
  /** 技能用来源（内置 / 个人）替代时间戳。 */
  skillSource?: "personal" | "builtin";
}

export interface SearchGroup {
  type: SearchResultType;
  items: SearchResult[];
}

/** 每个分组最多展示的条数，避免一次宽泛搜索把面板塞满。 */
const PER_GROUP_LIMIT = 8;
/** 面板打开时为客户端匹配拉取的活跃对话数量上限。 */
const CONVERSATION_FETCH_LIMIT = 500;

/**
 * 全局搜索数据 + 过滤 hook。
 *
 * 设计取舍：纯客户端搜索，直接复用各实体既有的 list 接口，不动 sidecar。
 * 这些 useQuery 只在搜索面板打开时才挂载（Radix Dialog 打开才 portal 内容），
 * 因此抓取天然是惰性的，无需额外的 `enabled` 开关。查询键带 `search` 前缀，
 * 与侧边栏 / Tasks 页面的缓存隔离，互不干扰。
 *
 * 匹配规则（大小写不敏感的子串匹配）：
 *   - 对话任务：标题（消息正文不在这里加载）
 *   - 定时任务：名称 / 描述 / prompt
 *   - 智能体：名称
 *   - 技能：名称 / 描述
 *
 * 空查询时退化为「最近」启动器：只展示按更新时间倒序的对话，贴合参考实现。
 */
export function useGlobalSearch(query: string): {
  groups: SearchGroup[];
  isLoading: boolean;
} {
  const conversations = useQuery({
    queryKey: ["search", "conversations"],
    queryFn: () => listConversations("active", CONVERSATION_FETCH_LIMIT),
    staleTime: 5_000,
  });
  const scheduled = useQuery({
    queryKey: ["search", "scheduled"],
    queryFn: () => listScheduledTasks(),
    staleTime: 5_000,
  });
  const agents = useQuery({
    queryKey: ["search", "agents"],
    queryFn: () => listAgentWorkspaces(),
    staleTime: 5_000,
  });
  // 技能复用既有 hook（查询键 ["skills"]，staleTime Infinity），与「自定义 > 技能」
  // 共享同一份缓存。
  const { skills, isLoading: skillsLoading } = useSkills();

  const isLoading =
    conversations.isLoading ||
    scheduled.isLoading ||
    agents.isLoading ||
    skillsLoading;

  const groups = useMemo<SearchGroup[]>(() => {
    const q = query.trim().toLowerCase();
    // 空查询时 has() 恒为真（展示全部），否则任一字段命中即可。
    const has = (...fields: (string | null | undefined)[]) =>
      q.length === 0 || fields.some((f) => !!f && f.toLowerCase().includes(q));

    const conversationItems: SearchResult[] = (conversations.data ?? [])
      .filter((c) => has(c.title))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: c.id,
        type: "conversation" as const,
        title: c.title,
        route: `/task/${c.id}`,
        updatedAt: c.updatedAt,
      }));

    const scheduledItems: SearchResult[] = (scheduled.data ?? [])
      .filter((s) => has(s.name, s.description, s.prompt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => ({
        id: s.id,
        type: "scheduled" as const,
        title: s.name,
        route: `/scheduled/${s.id}`,
        updatedAt: s.updatedAt,
      }));

    const agentItems: SearchResult[] = (agents.data ?? [])
      .filter((a) => has(a.name))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((a) => ({
        id: a.id,
        type: "agent" as const,
        title: a.name,
        route: `/agents/${a.id}`,
        updatedAt: a.updatedAt,
      }));

    const skillItems: SearchResult[] = skills
      .filter((s) => has(s.name, s.description))
      .map((s) => ({
        id: s.id,
        type: "skill" as const,
        title: s.name,
        route: "/skills",
        skillSource: s.source,
      }));

    const built: SearchGroup[] =
      q.length === 0
        ? [
            {
              type: "conversation",
              items: conversationItems.slice(0, PER_GROUP_LIMIT),
            },
          ]
        : [
            {
              type: "conversation",
              items: conversationItems.slice(0, PER_GROUP_LIMIT),
            },
            { type: "scheduled", items: scheduledItems.slice(0, PER_GROUP_LIMIT) },
            { type: "agent", items: agentItems.slice(0, PER_GROUP_LIMIT) },
            { type: "skill", items: skillItems.slice(0, PER_GROUP_LIMIT) },
          ];

    return built.filter((g) => g.items.length > 0);
  }, [query, conversations.data, scheduled.data, agents.data, skills]);

  return { groups, isLoading };
}
