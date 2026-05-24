import { useMemo } from "react";
import { deriveToolTimeline, type ToolStep } from "../runtime/derivations";
import type { ChatState } from "../runtime/types";

/**
 * Fallback timeline for Process Tab when the agent never calls TodoWrite.
 * Pure useMemo wrapper; pass the same `state` the rest of the right panel uses.
 */
export function useThreadToolTimeline(state: ChatState | null): {
  timeline: ToolStep[];
} {
  const timeline = useMemo(
    () => (state ? deriveToolTimeline(state) : []),
    [state],
  );
  return { timeline };
}
