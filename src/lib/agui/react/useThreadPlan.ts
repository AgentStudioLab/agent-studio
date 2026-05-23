import { useMemo } from "react";
import { useChat } from "./useChat";
import { deriveTodos, type TodoEntry } from "../runtime/derivations";

/**
 * Subscribe to a thread's ChatRuntime and derive the latest TodoWrite plan.
 * Memoised: only recomputes when the underlying state reference changes
 * (which is fine — runtime returns new state objects on every event).
 *
 * Returns `{ todos: [] }` while the thread has no TodoWrite calls yet — UI
 * components render the "等待 agent 制定计划…" empty state.
 */
export function useThreadPlan(threadId: string | null | undefined): {
  todos: TodoEntry[];
} {
  const { state } = useChat({ threadId: threadId ?? "" });
  const todos = useMemo(() => deriveTodos(state), [state]);
  return { todos };
}
