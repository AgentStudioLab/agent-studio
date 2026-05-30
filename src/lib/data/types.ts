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

/** A persistent Agent (智能体) — its own home dir + (P2/P3) folders, CLAUDE.md, memory. */
export interface AgentWorkspace {
  id: string;
  name: string;
  avatar: string | null;
  homeDir: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
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
