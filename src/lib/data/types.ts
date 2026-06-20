/**
 * Thread = conversation. The new AG-UI-style backend treats it as opaque
 * metadata (title/pin/agentWorkspaceId/timestamps); message content + tool calls
 * are surfaced through the agui runtime, not these REST types.
 */
export interface Conversation {
  id: string;
  title: string;
  agentWorkspaceId: string | null;
  pinned: boolean;
  archived: boolean;
  /** Resolved working directory used as cwd by the SDK. Server falls back to
   *  `~/.agent-studio` when the user hasn't picked one, so this is always
   *  a real path. */
  workingDir: string;
  /** Origin scheduled task when this conversation was spawned by the scheduler. */
  scheduledTaskId?: string | null;
  /** Conversation default model (seeded for scheduled runs); null → global default. */
  model?: string | null;
  /** Conversation default permission mode (seeded for scheduled runs); null → "ask". */
  permissionMode?: "ask" | "act-without-asking" | null;
  createdAt: number;
  updatedAt: number;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  runCount: number;
}

export interface ThreadAllowedTools {
  /** Resolved: per-thread override OR global default. */
  tools: string[];
  /** "global" = no override; "custom" = thread has its own list. */
  overrideMode: "global" | "custom";
}

export type Frequency = "manual" | "hourly" | "daily" | "weekdays" | "weekly";

export type SchedulePermissionMode = "ask" | "act-without-asking";

/** A scheduled-task definition. The sidecar scheduler polls `nextRunAt` and
 *  spawns a fresh conversation on each fire. */
export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  agentWorkspaceId: string | null;
  /** Working directory for spawned runs; null → default workspace. */
  workingDir: string | null;
  model: string | null;
  permissionMode: SchedulePermissionMode;
  frequency: Frequency;
  timeOfDay: string | null;
  /** 0=Sun..6=Sat anchor for 'weekly'; null → anchored to creation day. */
  weekday: number | null;
  enabled: boolean;
  /** "Always allowed" — tool names auto-approved during this task's runs. */
  allowedTools: string[];
  /** epoch ms; null for manual or disabled tasks. */
  nextRunAt: number | null;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type AgentFunctionCategory =
  | "development"
  | "research"
  | "writing"
  | "automation"
  | "general";

export type AgentCoverImage = AgentFunctionCategory;

/** A persistent Agent (智能体) — its own home dir + (P2/P3) folders, CLAUDE.md, memory. */
export interface AgentWorkspace {
  id: string;
  name: string;
  avatar: string | null;
  homeDir: string;
  archived: boolean;
  /** Pinned → surfaced in the sidebar Pinned section. */
  pinned: boolean;
  /** 挂载的技能 id 列表（三态）：null=继承全部启用技能；[]=显式不挂；非空数组=显式子集。
   *  运行时与全局启用集取交集。 */
  mountedSkills: string[] | null;
  /** 'user'=用户创建、可编辑/删除；'builtin'=官方只读预置，定义来自仓库内 JSON，
   *  不可改名/改头像/改指令/改技能/删除（仅 pin、聊天、文件空间等用户自有操作放行），
   *  可"克隆为我的智能体"。 */
  source: "user" | "builtin";
  /** 功能分类，用于智能体空间的分类 tab。旧数据/非法值在前端回退到 general。 */
  category: AgentFunctionCategory | string | null;
  /** 本地封面资产 id。旧数据/非法值在前端按 category 回退。 */
  coverImage: AgentCoverImage | string | null;
  createdAt: number;
  updatedAt: number;
}

/** An external folder mounted into an agent as extra context (P2). Read-only by
 *  default; `writable` grants the agent write access (OS-sandbox enforced). */
export interface AgentFolder {
  id: string;
  agentWorkspaceId: string;
  path: string;
  folderName: string;
  writable: boolean;
  createdAt: number;
}

/** A URL mounted into an agent as on-demand reference context (P3). Injected
 *  into systemPrompt.append; the agent fetches it with WebFetch when relevant. */
export interface AgentLink {
  id: string;
  agentWorkspaceId: string;
  url: string;
  title: string;
  createdAt: number;
}

/** One spawned run in a scheduled task's history. */
export interface ScheduledRun {
  threadId: string;
  title: string;
  status:
    | "idle"
    | "running"
    | "completed"
    | "error"
    | "cancelled"
    | "awaiting_approval";
  lastRunId: string | null;
  createdAt: number;
  updatedAt: number;
}
