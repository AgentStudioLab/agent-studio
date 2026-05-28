// Best-effort guardrail: tool calls that can irreversibly destroy data always
// require explicit approval, even on background runs whose allow-list would
// otherwise auto-approve them (mirrors Cowork's "always ask before permanently
// deleting files"). This is a UX safety net, NOT a security boundary — the real
// boundary is the workspace sandbox. The patterns can be evaded by a determined
// command; we accept that and keep the list conservative + readable.

const DESTRUCTIVE_BASH: RegExp[] = [
  /\brm\s+-[a-zA-Z]*[rf]/, // rm -r / rm -f / rm -rf
  /\brmdir\b/,
  /\bmkfs\b/,
  /\bdd\b[^|;&\n]*\bof=/, // dd writing to a device/file
  /\bgit\s+push\b[^|;&\n]*(--force|-f\b)/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\b[^|;&\n]*-[a-zA-Z]*f/,
  /\b(shutdown|reboot|halt|poweroff)\b/,
  />\s*\/dev\/(sd|nvme|disk|hd)/,
];

/** True when the tool call is irreversibly destructive and must be approved
 *  regardless of any allow-list. Currently only inspects `Bash` commands —
 *  the SDK has no dedicated delete tool; destructive ops go through the shell. */
export function isDestructiveToolCall(
  toolName: string,
  input: Record<string, unknown>,
): boolean {
  if (toolName !== "Bash") return false;
  const cmd = typeof input.command === "string" ? input.command : "";
  return DESTRUCTIVE_BASH.some((re) => re.test(cmd));
}
