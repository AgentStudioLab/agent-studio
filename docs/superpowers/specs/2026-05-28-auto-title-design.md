# Auto-title new conversations

Date: 2026-05-28

## Goal

A new task conversation starts titled "New task", then — on the **first turn
only** — the title is replaced by a ≤5-**word** summary of the user's first
message. Subsequent turns never re-title. Replaces today's "first 60 chars of
the prompt" title.

## Decisions (confirmed with user)

- Summarize from the **user's first message only** (not the first answer) — for
  low latency and robustness; matches Cowork.
- "≤5" means **5 words**, not characters. Keep the input language.
- Use the **conversation's configured model** (the `model` already sent to
  `POST /runs`); fall back to `ANTHROPIC_MODEL` env. Skip if neither.
- Server-side, fire-and-forget. Title propagates to the UI via the existing
  ~5s conversation/recents poll (no SSE push for v1).

## Changes

1. **Frontend `NewTaskView`** — create the conversation with
   `title: t("newTask.defaultTitle")` ("New task" / "新任务") instead of the
   prompt slice. (+ i18n key in `newTask.json` en/zh.)
2. **`MessageService.countByThread(threadId)`** — cheap COUNT for the
   first-turn gate.
3. **`sidecar/src/services/titleGenerator.ts`** (new) —
   `generateTitle(prompt, { apiKey, baseUrl?, model }, signal?)`: one-shot
   POST to `${baseUrl|api.anthropic.com}/v1/messages`, `max_tokens: 32`,
   system prompt "≤5 words, same language, no quotes/trailing punctuation,
   title only". Trims quotes + trailing punctuation, hard length cap. Returns
   `null` on any failure (caller keeps "New task").
4. **`routes/runs.ts`** — `MountRunsDeps.onFirstUserMessage?`. In `POST /runs`,
   compute `isFirstTurn = messages.countByThread(threadId) === 0` *before*
   `appendUser`; after `createRun`, if first turn call
   `onFirstUserMessage({ threadId, prompt, model })`. Scheduled runs bypass
   this route (they use `scheduler.fire`), so they're auto-excluded.
5. **`server.ts`** — wire `onFirstUserMessage` to: read providerSettings
   (apiKey/baseUrl), pick `model ?? process.env.ANTHROPIC_MODEL`, call
   `generateTitle`, and `threads.rename(threadId, title)` on success. Wrapped
   in try/catch; never throws into the run path.

## Notes / out of scope

- First-turn gate is message-count (decoupled from the placeholder string). A
  manual rename during the very first run could be overwritten once — accepted
  as a rare, low-harm edge.
- No live header push; the open thread's title updates on its next refetch.
