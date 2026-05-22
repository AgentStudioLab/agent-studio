/**
 * Thread = conversation. The new AG-UI-style backend treats it as opaque
 * metadata (title/pin/projectId/timestamps); message content + tool calls
 * are surfaced through the agui runtime, not these REST types.
 */
export interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  pinned: boolean;
  /** Resolved working directory used as cwd by the SDK. Server falls back to
   *  `~/.agent-studio` when the user hasn't picked one, so this is always
   *  a real path. */
  workingDir: string;
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
