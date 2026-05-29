import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/** Server + tool names. Model-visible tool id is `mcp__<server>__<tool>`. */
export const SCHEDULED_MCP_SERVER = "agent_studio";
export const SCHEDULED_TOOL_FQN = "mcp__agent_studio__create_scheduled_task";

export interface CreateScheduledTaskInput {
  name: string;
  prompt: string;
  description?: string;
  frequency: "manual" | "hourly" | "daily" | "weekdays" | "weekly";
  timeOfDay?: string;
  weekday?: number;
  /** Inherited from the conversation — not chosen by the agent. */
  workingDir?: string | null;
  model?: string | null;
}

/** Host-supplied creator (wired in server.ts to the ScheduledTaskService). */
export type CreateScheduledTaskFn = (
  input: CreateScheduledTaskInput,
  ctx: { threadId: string },
) => { id: string; name: string } | Promise<{ id: string; name: string }>;

/**
 * In-process MCP server exposing `create_scheduled_task`. Built per-run so the
 * handler can inherit the conversation's working dir + model (the agent never
 * supplies those). Registered in the SDK query's `mcpServers`; the tool id must
 * also be appended to `allowedTools`.
 */
export function buildScheduledMcpServer(deps: {
  threadId: string;
  cwd: string;
  model?: string;
  onCreate: CreateScheduledTaskFn;
}) {
  const createScheduledTask = tool(
    "create_scheduled_task",
    "Create a scheduled task that re-runs a prompt on a cadence (or on demand). " +
      "Use when the user wants something to run automatically on a schedule — e.g. " +
      "'every day at 9am', 'every weekday morning', 'weekly on Monday'. The new " +
      "task inherits this conversation's working directory and model. Ask the user " +
      "for any missing cadence or time before calling.",
    {
      name: z
        .string()
        .describe("Short title for the task, e.g. 'Daily standup summary'."),
      prompt: z
        .string()
        .describe("The full instruction the agent runs each time the task fires."),
      frequency: z
        .enum(["manual", "hourly", "daily", "weekdays", "weekly"])
        .describe("How often it runs. 'manual' = only when triggered by hand."),
      time_of_day: z
        .string()
        .optional()
        .describe(
          "Local time as 24-hour HH:MM (e.g. '09:00'). Required for daily, weekdays, and weekly.",
        ),
      weekday: z
        .number()
        .int()
        .min(0)
        .max(6)
        .optional()
        .describe("For 'weekly' only: 0=Sunday … 6=Saturday."),
      description: z
        .string()
        .optional()
        .describe("Optional one-line summary of what this task does."),
    },
    async (args) => {
      const task = await deps.onCreate(
        {
          name: args.name,
          prompt: args.prompt,
          description: args.description,
          frequency: args.frequency,
          timeOfDay: args.time_of_day,
          weekday: args.weekday,
          workingDir: deps.cwd,
          model: deps.model ?? null,
        },
        { threadId: deps.threadId },
      );
      const when =
        args.frequency === "manual"
          ? "on demand"
          : args.frequency +
            (args.time_of_day ? ` at ${args.time_of_day}` : "");
      return {
        content: [
          {
            type: "text",
            text: `Created scheduled task "${task.name}" (id: ${task.id}). It will run ${when}.`,
          },
        ],
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

  return createSdkMcpServer({
    name: SCHEDULED_MCP_SERVER,
    tools: [createScheduledTask],
  });
}
