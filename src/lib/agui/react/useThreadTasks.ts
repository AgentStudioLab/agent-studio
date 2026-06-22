import { useMemo } from "react";
import { deriveAgentTasks } from "../runtime/derivations";
import type { AgentTask, ChatState } from "../runtime/types";

/** Derive the current SDK Task tool snapshot for a TaskView ChatState. */
export function useThreadTasks(state: ChatState | null): { tasks: AgentTask[] } {
  const tasks = useMemo(() => (state ? deriveAgentTasks(state) : []), [state]);
  return { tasks };
}
