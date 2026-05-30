import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/** Model-visible id of the remember tool (server is shared `agent_studio`). */
export const REMEMBER_TOOL_FQN = "mcp__agent_studio__remember";

/** Host-supplied persister (wired in server.ts to AgentMemoryService). */
export type RememberFn = (
  content: string,
  ctx: { agentWorkspaceId: string; threadId: string },
) => void | Promise<void>;

/**
 * `remember` tool for the in-process `agent_studio` MCP server. Built per-run
 * and capturing the bound agentWorkspaceId so the agent can persist a durable
 * memory to the right workspace. Exposed ONLY on agent-bound runs; the FQN must
 * also be in `allowedTools`.
 */
export function buildRememberTool(deps: {
  agentWorkspaceId: string;
  threadId: string;
  onRemember: RememberFn;
}) {
  return tool(
    "remember",
    "Save a durable memory about THIS agent workspace — a fact, preference, or " +
      "decision worth recalling in future conversations with this agent. Use " +
      "sparingly, for things that should persist across sessions; not transient " +
      "details of the current task.",
    {
      content: z
        .string()
        .describe("The fact to remember, as a short standalone sentence."),
    },
    async (args) => {
      await deps.onRemember(args.content, {
        agentWorkspaceId: deps.agentWorkspaceId,
        threadId: deps.threadId,
      });
      return {
        content: [{ type: "text", text: `Saved to memory: ${args.content}` }],
      };
    },
    {
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
  );
}
