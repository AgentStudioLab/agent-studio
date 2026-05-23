import { useMemo } from "react";
import {
  deriveTouchedFiles,
  type TouchedFile,
} from "../runtime/derivations";
import type { ChatState } from "../runtime/types";

/**
 * Derive the files the agent has touched in this thread (cross-Run),
 * filtered to paths inside `workingDir`. Pure useMemo wrapper.
 *
 * Caller responsibility: pass the SAME `state` object that TaskView's
 * `useChat` returned. We do NOT call `useChat` internally — that would
 * create an independent runtime with empty messages.
 *
 * Returns `{ files: [] }` when state is null (no thread active) or when
 * the agent hasn't touched any files in the working directory yet.
 */
export function useThreadFiles(
  state: ChatState | null,
  workingDir: string | null | undefined,
): { files: TouchedFile[] } {
  const files = useMemo(
    () => (state ? deriveTouchedFiles(state, workingDir ?? null) : []),
    [state, workingDir],
  );
  return { files };
}
