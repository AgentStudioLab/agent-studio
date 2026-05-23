// src/lib/agui/react/useThreadPlan.ts
import { useMemo } from "react";
import { deriveTodos, type TodoEntry } from "../runtime/derivations";
import type { ChatState } from "../runtime/types";

/**
 * Derive the latest TodoWrite plan from a ChatState snapshot.
 *
 * Caller responsibility: pass the SAME `state` object that TaskView's
 * `useChat` returned. We do NOT call `useChat` here — that would create
 * an independent runtime with empty messages. Pure useMemo wrapper.
 *
 * Returns `{ todos: [] }` when state is null (no thread active) or when
 * no TodoWrite has been called yet.
 */
export function useThreadPlan(state: ChatState | null): {
  todos: TodoEntry[];
} {
  const todos = useMemo(
    () => (state ? deriveTodos(state) : []),
    [state],
  );
  return { todos };
}
