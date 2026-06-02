# Spec-3 — Add-a-link + Agent Avatar

**Status:** approved (brainstorm 2026-06-02). Two orthogonal features for the agent
detail page, finishing the Context card and the agent identity.

## Feature A — Add-a-link (URL as on-demand reference context)

**Decision:** a link is a stored reference, injected into `systemPrompt.append` as a
one-line list; the agent fetches it with `WebFetch` on demand. **No RAG, no fetch
on add, no per-run fetch.** Mirrors `agent_folders` (minus write/tree).

### Backend
- **Table** `agent_links(id, agent_workspace_id, url, title, created_at)` — FK
  `ON DELETE CASCADE` like `agent_folders`; `id = alk_<nanoid>`; index on
  `agent_workspace_id`.
- **Service** `AgentLinkService`: `create` / `get` / `listByAgent` / `delete`. No
  `setWritable`, no `update` (edit = delete + re-add — YAGNI).
- **Routes** `/agents/:id/links`: `GET` list, `POST {url, title?}`, `DELETE /:linkId`.
  Agent-missing → 404. URL validated with `new URL()` + protocol `http(s)` only,
  else `400 invalid_url`. `title` defaults to the URL host.
- **Injection** `buildAgentAppendContext(claudeMd, memoryIndex, links)` gains a 3rd
  param. Non-empty → append a `## Reference links` section (`- [title](url)` lines +
  a "fetch with WebFetch on demand" note). `runWorker` reads
  `agentLinks.listByAgent(id)` next to the existing folders lookup; `agentLinks`
  threads through `server.ts` → `runs.ts` / `scheduler.ts` → `runWorker` exactly like
  `agentFolders`.

### Frontend
- **Data** `agent-links.ts` (list/create/delete) + `agent-link-queries.ts`
  (`agentLinkKeys`, `useAgentLinks`, create/delete mutations) — mirrors agent-folders.
- **`AgentLinksCard`** (body-only): each link = a row with a `Link` icon + title + host;
  click opens it in the system browser (Tauri `shellOpen`); hover reveals `×` delete.
  Empty → `links.empty`.
- **`AddLinkModal`**: URL input + optional title; validates URL client-side; on submit
  calls the create mutation.
- **`ContextCard`**: add a "Links" sub-section between "On your computer" and "Memory";
  add an "Add a link" item to the `＋` dropdown opening `AddLinkModal`.
- **i18n** (en + zh): `context.{addLink,links}`, `links.{empty,remove,invalidUrl}`,
  `addLinkModal.{title,urlPlaceholder,titlePlaceholder,cancel,add}`.

## Feature B — Agent avatar (hue square, name-derived initials)

**Decision:** `avatar` stores one of the 7 `InitialsAvatar` hues; initials derive from
the name; default hue is a deterministic hash of the agent id (so unedited agents
aren't all gray). The field already exists end-to-end (DB/type/routes) but renders
nowhere — this surfaces + edits it.

### Frontend only
- **Helpers** `src/shared/atoms/agent-avatar.ts`: `initialsFromName(name)` (CJK → first
  char; latin → first letters of first two words) and `hueForAgent({id, avatar})`
  (valid stored hue, else deterministic hash → one of the 7 hues).
- **Display**: `AgentCard` (list) + `AgentSpaceHeader` (detail title) render an
  `InitialsAvatar` (square/solid).
- **Edit**: `NewAgentModal` gains a 7-swatch hue picker + a live preview avatar.
  `onSave` signature `{ name }` → `{ name, avatar }`; create (`AgentsView`) + edit
  (`AgentSpaceHeader`) both pass `avatar`. The picker references hue primitives
  directly (the documented categorical-palette exception).
- **i18n**: `agents.modal.color`.

## Cross-cutting
- design-tokens 3-tier (no hardcoded hex), anti-AI-slop, lucide icons.
- Tests (bun): `agentLinks` service + route (URL validation / 404); link injection in
  `buildAgentAppendContext`; `initialsFromName` + `hueForAgent` pure-function tests.
- Direct implementation on `main`, commits carry the Co-Authored-By trailer.
