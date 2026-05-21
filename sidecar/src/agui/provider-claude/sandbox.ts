// Workspace path sandbox.
//
// The Claude Agent SDK's `cwd` option is just the working directory; built-in
// file tools (Read/Write/Edit/...) happily accept absolute paths anywhere on
// disk. We enforce the "this conversation only sees its workspace" promise in
// the canUseTool gate by inspecting the tool input and rejecting any path
// that resolves outside `root` before the user even sees an approval card.
//
// Scope decisions:
//   - Bash is intentionally NOT sandboxed here. A command like `cd /elsewhere`
//     can't be detected by inspecting its arg shape, and Bash is already
//     gated by HITL approval (user reads the command before allow).
//   - Web tools (WebFetch / WebSearch) and Task (subagent) don't touch the
//     local filesystem via path args, so they pass through.

import { resolve, relative, isAbsolute, sep } from "node:path";

/**
 * Returns true if `target` resolves to a location inside `root` (including
 * exact equality). Symlinks are NOT resolved — that would require I/O at
 * gate time which would slow every tool call; the SDK's tools follow links
 * as the OS does anyway, and the user picked the workingDir.
 */
export function isPathUnder(target: string, root: string): boolean {
  const absTarget = isAbsolute(target) ? target : resolve(root, target);
  const absRoot = resolve(root);
  const rel = relative(absRoot, absTarget);
  if (rel === "") return true; // exact match
  if (rel.startsWith("..")) return false;
  // On *nix `relative` returns "" or a non-leading-".." path when target is
  // under root. Defensive: also reject absolute paths (cross-volume on win).
  return !isAbsolute(rel) && !rel.startsWith(".." + sep);
}

/**
 * Inspect a tool invocation and return a deny reason (string) if any of its
 * filesystem-touching arguments fall outside `root`. Returns null to allow.
 * The returned string is what the SDK feeds back to the model as the deny
 * message, so it should be specific enough for the model to adjust.
 */
export function checkWorkspaceSandbox(
  toolName: string,
  input: Record<string, unknown>,
  root: string,
): string | null {
  // Tools that take a single `file_path` (string) argument.
  if (
    toolName === "Read" ||
    toolName === "Write" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "NotebookEdit"
  ) {
    const fp = input.file_path;
    if (typeof fp !== "string") return null;
    if (!isPathUnder(fp, root)) {
      return `Path ${fp} is outside the working directory (${root}). This conversation is sandboxed to that directory.`;
    }
    return null;
  }

  // Tools whose `path` argument optionally narrows a search root.
  if (toolName === "Glob" || toolName === "Grep") {
    const p = input.path;
    if (typeof p !== "string") return null; // optional → defaults to cwd
    if (!isPathUnder(p, root)) {
      return `Search root ${p} is outside the working directory (${root}).`;
    }
    return null;
  }

  return null;
}
