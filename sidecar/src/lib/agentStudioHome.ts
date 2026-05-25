import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Lazy-initialise `~/.agent-studio/`'s child directories so the rest of
 * sidecar can assume they exist:
 *
 *   ~/.agent-studio/workspace/   default cwd (used by ThreadService)
 *   ~/.agent-studio/skills/      personal skill source (scanned by skillRegistry)
 *
 * Idempotent — safe to call on every boot. mkdirSync with `recursive: true`
 * silently succeeds when the target exists.
 *
 * Side-effect of creating `skills/` proactively: the user sees an empty
 * directory in Finder and discovers where to drop their own SKILL.md
 * folders without reading docs.
 */
export function ensureAgentStudioHome(): { workspace: string; skills: string } {
  const root = join(homedir(), ".agent-studio");
  const workspace = join(root, "workspace");
  const skills = join(root, "skills");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(skills, { recursive: true });
  return { workspace, skills };
}
