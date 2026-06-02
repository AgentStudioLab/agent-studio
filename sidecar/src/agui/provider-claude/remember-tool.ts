import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { MemoryEditResult } from "../../services/agentMemoryStore";

export const REMEMBER_TOOL_FQN = "mcp__agent_studio__remember";

export type MemoryEdit =
  | { action: "save"; file: string; title: string; hook: string; content: string; type?: string }
  | { action: "remove"; file: string };

export type RememberFn = (
  edit: MemoryEdit,
  ctx: { agentWorkspaceId: string; threadId: string },
) => MemoryEditResult | Promise<MemoryEditResult>;

/** Returns an error string for the model, or null when args are usable. Pure. */
export function validateMemoryEditArgs(args: {
  action: "save" | "remove";
  file?: string;
  title?: string;
  hook?: string;
  content?: string;
  type?: string;
}): string | null {
  if (!args.file?.trim()) return "`file` (the scenario slug) is required.";
  if (args.action === "save") {
    if (!args.title?.trim()) return "`title` is required for save.";
    if (!args.hook?.trim()) return "`hook` is required for save.";
    if (!args.content?.trim()) return "`content` is required for save.";
  }
  return null;
}

/** Model-facing text. Pure. */
export function resultToText(edit: MemoryEdit, result: MemoryEditResult): string {
  if (result.status === "not_found") {
    return `No memory file "${edit.file}" found. List the memory index first; use an existing slug to edit, or a new slug to create.`;
  }
  return edit.action === "save"
    ? `Saved memory "${result.message}" → ${edit.file}.md (indexed in MEMORY.md).`
    : `Removed memory ${edit.file}.md from MEMORY.md.`;
}

/**
 * `remember` tool for the in-process `agent_studio` MCP server. The agent manages
 * its own memory as markdown files under <home>/memory/: a MEMORY.md index +
 * per-scenario <slug>.md files. The index is in your context — consult it first.
 *   - save:   write a scenario file + upsert its index line. To extend an existing
 *             scenario, Read its file, merge, and save the FULL content under the
 *             same `file`; for a new scenario pick a new `file` slug.
 *   - remove: delete a scenario file + its index line.
 * Exposed ONLY on agent-bound runs; FQN must also be in allowedTools.
 */
export function buildRememberTool(deps: {
  agentWorkspaceId: string;
  threadId: string;
  onRemember: RememberFn;
}) {
  return tool(
    "remember",
    "Manage durable memory for THIS agent as markdown files: a MEMORY.md index " +
      "(in your context) + per-scenario <slug>.md files. action='save' writes a " +
      "scenario file and upserts its index line; to add to an existing scenario, " +
      "Read that file, merge, and save the full content under the same `file`; " +
      "use a new `file` slug for a new scenario. action='remove' deletes a scenario " +
      "file + its index line. Save sparingly — durable facts worth recalling in " +
      "future sessions, not transient task details.",
    {
      action: z.enum(["save", "remove"]).describe("save a scenario memory file, or remove one."),
      file: z.string().describe("scenario slug (kebab-case, no extension), e.g. 'user-profile'."),
      title: z.string().optional().describe("save: human title shown in the index link."),
      hook: z.string().optional().describe("save: one-line hook in the index — what this memory is about (used for recall)."),
      content: z.string().optional().describe("save (required): the FULL markdown body of the scenario file."),
      type: z
        .enum(["user", "feedback", "project", "reference"])
        .optional()
        .describe("save (optional): classify this memory — user | feedback | project | reference."),
    },
    async (args): Promise<{ content: { type: "text"; text: string }[] }> => {
      const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
      const invalid = validateMemoryEditArgs(args);
      if (invalid) return text(invalid);
      const edit: MemoryEdit =
        args.action === "save"
          ? { action: "save", file: args.file, title: args.title!, hook: args.hook!, content: args.content!, type: args.type }
          : { action: "remove", file: args.file };
      const result = await deps.onRemember(edit, {
        agentWorkspaceId: deps.agentWorkspaceId,
        threadId: deps.threadId,
      });
      return text(resultToText(edit, result));
    },
    { annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  );
}
