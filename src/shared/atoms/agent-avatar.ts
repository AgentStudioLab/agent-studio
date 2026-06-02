// Agent avatar helpers: an agent's `avatar` field stores one of these 7 hues
// (or null). Initials derive from the name; an unset/invalid hue falls back to a
// deterministic hue from the agent id so unedited agents aren't all one color.

export const AVATAR_HUES = [
  "orange",
  "blue",
  "purple",
  "red",
  "green",
  "amber",
  "stone",
] as const;

export type AvatarHue = (typeof AVATAR_HUES)[number];

// CJK ideographs + CJK punctuation (U+3000–U+9FFF) and Hangul (U+AC00–U+D7AF).
const CJK_LEADING = /[　-鿿가-힯]/;

/** First-letter initials: CJK/Hangul → the first glyph; latin → first letters of
 *  the first two words (or the first two letters of one word). "?" when empty. */
export function initialsFromName(name: string): string {
  const n = name.trim();
  if (!n) return "?";
  if (CJK_LEADING.test(n[0]!)) return n[0]!;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words[0]![0]! + words[1]![0]!;
  return n.slice(0, 2);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The stored hue when valid, else a deterministic hue from the agent id. */
export function hueForAgent(agent: { id: string; avatar: string | null }): AvatarHue {
  if (agent.avatar && (AVATAR_HUES as readonly string[]).includes(agent.avatar)) {
    return agent.avatar as AvatarHue;
  }
  return AVATAR_HUES[hashString(agent.id) % AVATAR_HUES.length]!;
}
