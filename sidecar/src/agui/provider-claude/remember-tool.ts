import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MemoryBlock, MemoryEditResult } from "../../services/agentMemories";

/** Model-visible id of the remember tool (server is shared `agent_studio`). */
export const REMEMBER_TOOL_FQN = "mcp__agent_studio__remember";

/** One edit the agent issues against its own memory. */
export interface MemoryEdit {
  action: "add" | "replace" | "remove";
  block: MemoryBlock;
  /** add: the new memory. replace: the replacement text. */
  content?: string;
  /** replace/remove: substring locating the agent-written entry to target. */
  match?: string;
}

/** Host-supplied persister (wired in server.ts to AgentMemoryService). */
export type RememberFn = (
  edit: MemoryEdit,
  ctx: { agentWorkspaceId: string; threadId: string },
) => MemoryEditResult | Promise<MemoryEditResult>;

/**
 * Validate the action/content/match combo. Returns an error string to show the
 * model (so it self-corrects), or null when the args are usable. Pure + exported
 * for testing.
 */
export function validateMemoryEditArgs(args: {
  action: MemoryEdit["action"];
  content?: string;
  match?: string;
}): string | null {
  if ((args.action === "add" || args.action === "replace") && !args.content?.trim()) {
    return "`content` is required for add and replace.";
  }
  if ((args.action === "replace" || args.action === "remove") && !args.match?.trim()) {
    return "`match` is required for replace and remove.";
  }
  return null;
}

/** Turn a persistence result into the text the model reads back. Pure + exported. */
export function resultToText(edit: MemoryEdit, result: MemoryEditResult): string {
  if (result.status === "no_match") {
    return `No agent-written memory in "${edit.block}" matches "${edit.match}". (Memories you didn't write yourself can't be edited via this tool — leave them be.)`;
  }
  if (result.status === "ambiguous") {
    const list = result.matches.map((m) => `  - ${m}`).join("\n");
    return `"${edit.match}" matches ${result.matches.length} entries in "${edit.block}" — be more specific:\n${list}`;
  }
  switch (edit.action) {
    case "add":
      return `Saved to ${edit.block} memory: ${result.message}`;
    case "replace":
      return `Updated a ${edit.block} memory → ${result.message}`;
    case "remove":
      return `Removed from ${edit.block} memory: ${result.message}`;
  }
}

/**
 * `remember` tool for the in-process `agent_studio` MCP server. Built per-run
 * and capturing the bound agentWorkspaceId. The agent manages its own memory in
 * two budgeted blocks — `profile` (about the user) and `facts` (about the
 * project/work) — via three actions:
 *   - add:     write a new memory
 *   - replace: rewrite an existing memory you wrote, located by substring
 *   - remove:  delete an existing memory you wrote, located by substring
 * Only memories you wrote are editable (user-authored ones are read-only). When
 * a block nears its budget (shown in your context) consolidate it: replace
 * duplicates with one entry, remove stale facts. Exposed ONLY on agent-bound
 * runs; the FQN must also be in `allowedTools`.
 */
export function buildRememberTool(deps: {
  agentWorkspaceId: string;
  threadId: string;
  onRemember: RememberFn;
}) {
  return tool(
    "remember",
    "Manage durable memory about THIS agent workspace, split into two blocks: " +
      "'profile' (facts/preferences about the user) and 'facts' (conventions/" +
      "decisions about the project or work). action='add' saves a new memory; " +
      "'replace' rewrites one you previously saved (located by the `match` " +
      "substring); 'remove' deletes one you saved. Only memories you wrote are " +
      "editable. Save sparingly — things worth recalling in future sessions, " +
      "not transient task details. When a block nears capacity (shown in your " +
      "context), consolidate: merge duplicates via replace, drop stale via remove.",
    {
      action: z
        .enum(["add", "replace", "remove"])
        .describe("add a new memory, replace one you wrote, or remove one you wrote."),
      block: z
        .enum(["profile", "facts"])
        .describe("'profile' = about the user; 'facts' = about the project/work."),
      content: z
        .string()
        .optional()
        .describe("For add: the new memory, as a short standalone sentence. For replace: the replacement text."),
      match: z
        .string()
        .optional()
        .describe("For replace/remove: a substring uniquely identifying the existing memory you wrote."),
    },
    async (args): Promise<{ content: { type: "text"; text: string }[] }> => {
      const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
      const invalid = validateMemoryEditArgs(args);
      if (invalid) return text(invalid);
      const edit: MemoryEdit = {
        action: args.action,
        block: args.block,
        content: args.content,
        match: args.match,
      };
      const result = await deps.onRemember(edit, {
        agentWorkspaceId: deps.agentWorkspaceId,
        threadId: deps.threadId,
      });
      return text(resultToText(edit, result));
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
