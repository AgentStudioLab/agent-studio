import type { UserProfile } from "../services/userProfileSettings";

// Map of work-key (matches the Select options on the frontend ProfileForm)
// to a short English phrase. Localizing the agent's system prompt to the
// user's UI locale would be nice, but the model itself responds well in
// either language regardless — English keeps tokens tight.
const WORK_LABEL: Record<string, string> = {
  engineer: "Software engineer",
  designer: "Designer",
  pm: "Product manager",
  researcher: "Researcher",
  writer: "Writer",
  operations: "Operations",
  other: "Generalist",
};

/**
 * Compose the per-user prompt addition fed to `options.systemPrompt.append`.
 *
 * Each profile field is optional. We skip any empty section so the final
 * string contains only the parts the user actually filled in. If everything
 * is empty, returns `null` and the caller should drop the `append` field
 * entirely (so the SDK uses the unmodified preset prompt).
 */
export function composeAppendPrompt(profile: UserProfile): string | null {
  const parts: string[] = [];

  const callMe = profile.callMe.trim();
  if (callMe.length > 0) {
    parts.push(`Address the user as "${callMe}".`);
  }

  const work = profile.work.trim();
  if (work.length > 0) {
    const label = WORK_LABEL[work] ?? work;
    parts.push(`The user's role: ${label}.`);
  }

  const instructions = profile.instructions.trim();
  if (instructions.length > 0) {
    parts.push(`Additional user instructions:\n${instructions}`);
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/**
 * Per-run language directive for `systemPrompt.append`, derived from the
 * caller's UI locale (the frontend forwards `i18n.language` on each run).
 * Only emitted for Chinese — English is the model's default, so steering it
 * would cost tokens for no gain. Phrased to defer to any explicit user
 * instruction, so it acts as a default rather than an override. Returns null
 * when no directive is needed.
 */
export function languageDirective(locale: string | undefined): string | null {
  if (typeof locale !== "string") return null;
  if (locale.toLowerCase().startsWith("zh")) {
    return "除非用户另有要求，请始终使用简体中文回答，包括你的思考过程（thinking）、过程更新，以及工具调用前后的简短说明。";
  }
  return null;
}
