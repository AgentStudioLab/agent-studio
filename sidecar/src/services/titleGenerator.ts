import { query } from "@anthropic-ai/claude-agent-sdk";

interface GenerateTitleDeps {
  apiKey: string;
  baseUrl?: string;
  /** Conversation's configured model (same one the run uses). */
  model: string;
}

const SYSTEM_PROMPT =
  "You are a chat title generator. You NEVER answer or act on the user's " +
  "message — you only produce a short title that describes what it is about.";

function buildPrompt(message: string, strict: boolean): string {
  const rules = [
    "At most 5 words.",
    "Same language as the message.",
    "No quotes, no markdown, no trailing punctuation.",
    "Output ONLY the title text — do not answer or explain the message.",
  ];
  if (strict) {
    rules.push("Your previous attempt was too long — make it MUCH shorter.");
  }
  return [
    "Write a concise title for the conversation the user message below starts.",
    ...rules.map((r) => `- ${r}`),
    "",
    "User message:",
    '"""',
    message.slice(0, 4000),
    '"""',
  ].join("\n");
}

/**
 * One-shot title summary via the SDK `query` — same path the main agent uses,
 * so it works with whatever endpoint/model the user configured. The message is
 * passed as *data to title* (not a turn to answer). The result is validated for
 * length; an over-long / junk title is rejected and retried once, then we give
 * up (caller keeps the "New task" placeholder). Fire-and-forget — never throws.
 */
export async function generateTitle(
  prompt: string,
  deps: GenerateTitleDeps,
  signal?: AbortSignal,
): Promise<string | null> {
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await runOnce(trimmed, deps, attempt === 1, signal);
    if (raw == null) continue;
    const cleaned = cleanTitle(raw);
    if (!cleaned) continue;
    if (isTooLong(cleaned)) {
      console.warn(
        `[titleGenerator] rejected (too long, attempt ${attempt + 1}): "${cleaned}"`,
      );
      continue;
    }
    return cleaned;
  }
  return null;
}

async function runOnce(
  message: string,
  deps: GenerateTitleDeps,
  strict: boolean,
  signal?: AbortSignal,
): Promise<string | null> {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ANTHROPIC_API_KEY: deps.apiKey,
  };
  if (deps.baseUrl) env.ANTHROPIC_BASE_URL = deps.baseUrl;

  try {
    const stream = query({
      prompt: buildPrompt(message, strict),
      options: {
        model: deps.model,
        env,
        cwd: process.cwd(),
        allowedTools: [],
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: 1,
        abortController: ac,
      },
    });
    for await (const m of stream) {
      if (m.type === "result") {
        if (m.subtype === "success" && typeof m.result === "string") {
          return m.result;
        }
        console.warn("[titleGenerator] non-success result:", m.subtype);
        return null;
      }
    }
    return null;
  } catch (err) {
    console.warn("[titleGenerator] query failed:", err);
    return null;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Length gate. "≤5 words" is exact for space-separated languages; CJK has no
 * word boundaries so we bound it by character count instead (a single char cap
 * can't distinguish a valid 5-word English title from a long Chinese sentence).
 */
function isTooLong(t: string): boolean {
  // Hiragana/Katakana + CJK Unified Ideographs.
  const hasCJK = /[぀-ヿ一-鿿]/.test(t);
  if (hasCJK) return [...t].length > 16;
  return t.split(/\s+/).filter(Boolean).length > 5;
}

/** Strip first-line, markdown, quotes, labels, and trailing punctuation. */
function cleanTitle(raw: string): string {
  let t = raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  t = t.replace(/^(title|标题)\s*[:：]\s*/i, "").trim();
  t = t.replace(/[*_`#>]/g, "").trim();
  t = t.replace(/^["'“”「『《]+/, "").replace(/["'”」』》]+$/, "").trim();
  t = t.replace(/[。.!?！？,，;；:：]+$/, "").trim();
  if (t.length > 60) t = t.slice(0, 60).trim();
  return t;
}
