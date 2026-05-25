import { useMemo } from "react";
import { deriveProgressPhases, type PhaseEntry } from "../runtime/derivations";
import type { ChatState } from "../runtime/types";

/**
 * 4-phase progress view for Process Tab: context → plan → execute → finish.
 * Pure useMemo wrapper around deriveProgressPhases; pass the same `state`
 * the rest of the right panel consumes.
 */
export function useThreadProgressPhases(state: ChatState | null): {
  phases: PhaseEntry[];
} {
  const phases = useMemo(
    () => (state ? deriveProgressPhases(state) : []),
    [state],
  );
  return { phases };
}
