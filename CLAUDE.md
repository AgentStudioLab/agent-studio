# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

Three independent subprojects in one repo, **no workspaces**:

- `src/` — React 19 + TypeScript + Tailwind v4 + shadcn frontend (Vite 8 / rolldown)
- `src-tauri/` — Rust shell (Tauri v2), spawns sidecar + manages persistence
- `sidecar/` — Bun + Hono HTTP/SSE server, compiled to a single native binary per platform
- `scripts/build-sidecar.ts` — orchestrates `bun build --compile` across target triples

Vite MUST live at the repo root because `tauri.conf.json` has `frontendDist: "../dist"` resolved relative to `src-tauri/`. Do not introduce a `package.json` workspace setup.

## Frontend directory layout (`src/`)

Feature-folder + co-location convention. Each feature owns its page composer + private subcomponents in the same directory. No `views/` folder. No `index.ts` barrels (breaks tree-shaking per `vercel-react-best-practices` `bundle-barrel-imports`).

```
src/
  app/                          # App-level chrome + routing
    AppShell.tsx                # 3-pane layout (sidebar + main + optional aside)
    AppShellContext.tsx         # currentView + setView + preview + hideSidebar
    RouterView.tsx              # switch-on-currentView routing
    MacTitlebar.tsx             # 36px overlay titlebar (Tauri)
  features/                     # Each feature self-contained
    new-task/                   # NewTaskView
    task/                       # TaskView + TaskHeader/ChatStream/RightPanel/PreviewPane/tabs
    projects/                   # ProjectsView + ProjectCard
    project-detail/             # ProjectDetailView + InstructionsCard/ScheduledMiniCard/etc.
    scheduled/                  # ScheduledListView + ScheduledDetailView + cards
    customize/                  # CustomizeView + Nav/Home + skills/agents/plugins bodies
    settings/                   # SettingsView + ProfileForm
    sidebar/                    # Sidebar + NavItem/PinnedItem/RecentItem/UserBar
  shared/
    atoms/                      # BrandStar / InitialsAvatar / StatusDot / ThemeSegment
  components/
    ui/                         # shadcn primitives (do not modify by hand)
    ai-elements/                # vercel/ai-elements (do not modify by hand)
  lib/
    mock/                       # static fixtures (typed)
    sidecar-client.ts
    useThemeMode.ts
    utils.ts
  styles/                       # 3-tier design tokens (see convention #7)
```

**Rules:**
- View = thin composer (< 80 lines). Logic lives in feature-local hooks/utils; UI in private subcomponents.
- Private subcomponents stay inside their feature. Promote to `shared/` only when a second feature needs them.
- Import via direct path (`@/features/task/TaskView`), never via barrel.
- New feature → new directory under `features/`. Don't add it to `app/` or `shared/`.

## Common commands

```bash
bun run dev                          # Vite only, http://localhost:1420
bun run build                        # tsc -b && vite build → dist/
bun run build:sidecar -- --host-only # compile sidecar for current host only
bun run build:sidecar                # compile sidecar for all 3 targets
bun run tauri:dev                    # host sidecar + tauri dev (full app)
bun run tauri:build                  # all sidecars + tauri release build

# Rust side
cargo check --manifest-path src-tauri/Cargo.toml

# Sidecar standalone (dev token, fixed port 4123)
cd sidecar && bun run dev

# Tests — Bun's runner everywhere (NOT vitest), even for frontend .tsx tests
bun test                              # frontend (run from repo root)
cd sidecar && bun test               # sidecar
bun test path/to/file.test.ts        # single file
bun test -t "name substring"         # single test by name

# Typecheck (no emit)
bunx tsc --noEmit -p tsconfig.app.json   # frontend
cd sidecar && bunx tsc --noEmit          # sidecar
```

Every `*.test.ts(x)` imports from `bun:test` — running them under vitest fails with `Cannot find package 'bun:test'`. There is no vitest in this repo.

Target triples handled by `scripts/build-sidecar.ts`:

| Bun target | Tauri triple | Output |
|---|---|---|
| `bun-darwin-arm64` | `aarch64-apple-darwin` | `src-tauri/binaries/agent-studio-sidecar-aarch64-apple-darwin` |
| `bun-darwin-x64` | `x86_64-apple-darwin` | `…-x86_64-apple-darwin` |
| `bun-windows-x64` | `x86_64-pc-windows-msvc` | `…-x86_64-pc-windows-msvc.exe` |

No Linux support — explicit project decision.

## Architecture: how the three pieces talk

```
[ React UI ]
   │
   │  invoke('get_sidecar_info') → { port, token }   (one-time, cached)
   │  fetch http://127.0.0.1:<port>/* + Bearer <token>
   ▼
[ Tauri Rust shell ]                [ Bun sidecar (HTTP/SSE) ]
   │  setup():                          ▲
   │    portpicker pick_unused_port     │ Hono bearer middleware
   │    rand 32-char Alphanumeric token │ rejects bad/missing token → 401
   │    shell.sidecar(...).spawn        │
   │       --port=<n> --token=<t>  ─────┘
   │  app.manage(SidecarInfo { port, token })
   │  on RunEvent::Exit → child.kill()
   ▼
tauri-plugin-store (Rust-side JSON KV, persistence)
```

Frontend client lives in `src/lib/sidecar-client.ts`:
- `getSidecarInfo()` — invokes Tauri command once, caches the promise
- `fetchSidecar(path, init?)` — injects base URL + Authorization header
- `subscribeSSE(path, onEvent, signal?)` — manual SSE parser over fetch+ReadableStream (not EventSource, because EventSource can't carry auth headers)

## Architecture: inside the sidecar (the AGUI run engine)

The sidecar is a single-threaded async event hub. Three layers, provider-agnostic core:

```
routes/*  (Hono HTTP/SSE)                       services/*   (DB-backed + in-memory)
   POST /runs ─┐                                  threads, messages, scheduledTasks,
   regenerate ─┼──► agent/runWorker.ts ──► agui/core/runLoop.ts   usage, audit, scheduler,
   scheduler ──┘        (single exec path)        │              titleGenerator, skillRegistry…
                                                   │ consumes
                                  agui/core/provider-types.ts  (AgentProvider interface)
                                                   ▲ implemented by
                                  agui/provider-claude/  (adapts @anthropic-ai/claude-agent-sdk)
                                                   │ persists via
                                  agui/core/store-types.ts ◄── agui/store-sqlite/  (event log)
```

**Run lifecycle is event-sourced.** A run is an append-only log in `run_events (run_id, seq, type, payload)` with the run row tracking `last_seq` + `status` (`running` → `completed`/`error`/`cancelled`/`awaiting_approval`). `runLoop.ts` drains the provider's `AsyncIterable<AGUIEvent>` (`RUN_STARTED` → `TEXT_MESSAGE_*`/`TOOL_CALL_*`/`REASONING_*` → `RUN_FINISHED`/`RUN_ERROR`), appending each event in a transaction that bumps `seq` and signals an EventEmitter so live SSE streamers wake immediately. `GET /runs/:id/events?after=<seq>` replays from any cursor — this is what makes runs resumable across reloads and cross-session attach.

**`runWorker` is the one execution path.** POST /runs, POST /threads/:id/regenerate, and the scheduler tick all funnel through `agent/runWorker.ts` (fire-and-forget; the route returns 202 immediately). It buffers assistant/tool messages in memory and flushes them to the `messages`/`tool_calls` tables **only at run terminal** — never mid-run — so a cross-session resume that replays `run_events` can't create duplicate persisted turns.

**`agui/core` is provider-agnostic.** It knows only the `AgentProvider` interface (`run`/`resume`/`getPendingInterrupts`/`rewindFiles`). `agui/provider-claude/` is the only implementation: `provider.ts` wraps the SDK `query()` generator and owns the `canUseTool` approval gates; `bridge.ts` translates `SDKMessage` → AGUI events. Satellites: `interrupt-bus` (HITL deferred-promise map keyed by runId), `sandbox` (path-based workspace guardrail), `destructive` (always-surface guardrail for `rm -rf`/`git reset --hard`/etc., even when allow-listed), `session-tag` (SDK session ↔ threadId), `audit-hook`+`redact` (tool audit log with secret masking), `error-map` (SDK errors → `RunErrorCode`), `file-rewind` (roll back Write/Edit on regenerate), `scheduled-tool` (in-process MCP server `mcp__agent_studio__create_scheduled_task`). **Before editing anything here, consult the `claude-agent-sdk-reference` skill** (per the Skills section).

**HITL = the `awaiting_approval` status.** When `canUseTool` needs the user, the provider emits an interrupt; runLoop writes `RUN_FINISHED(outcome:"interrupt")` and parks the run at `awaiting_approval`. The client renders an approval/ask-user card and calls `POST /runs/:id/resume`, which resolves the interrupt-bus deferred and the worker continues. Stale resumes are a benign 202 (`alreadyResolved:true`), never a 409 — see `routes/runs.test.ts`.

**`server.ts` wires DI at boot** (CLI: `--port`/`--token`/`--db`; bearer-auth middleware on all routes). It reconciles orphaned runs on startup (crashed `running` → `error`; orphaned `awaiting_approval` → `cancelled` + a system note), lazily caches the provider per (apiKey, baseUrl) and rebuilds it on `/settings/provider` change, and starts the poll-based `scheduler` (ticks only when an apiKey is configured).

## Architecture: frontend AGUI runtime (`src/lib/agui/`)

Mirrors the sidecar's event protocol on the client. Two layers:

- **`runtime/`** — framework-agnostic chat state machine. `createChatRuntime()` (runtime.ts) owns immutable `ChatState` (`isRunning`, `activeRunId`, `historicalMessages`, `liveMessages`, `pendingInterrupts`, `error`, `lastCursor`) and exposes `send`/`regenerate`/`cancel`/`resume`/`attachToRun`/`restoreAwaiting` + pub-sub. `reducer.ts` is a pure `applyEvent(state, event)` that folds incoming AGUI SSE events into `ChatState` (accumulating `argsBuffer` for partial tool-call JSON, sweeping pending spinners on terminal). `sse.ts` is a resumable manual SSE parser (cursor-per-frame `?after=`, exponential backoff) — distinct from `sidecar-client`'s lower-level `subscribeSSE`. `api.ts` is the HTTP client and defines `RunInProgressError` (the 409 contract). `derivations.ts`/`thinking.ts`/`sweep.ts` derive progress phases, todos, touched files, and the "思考中" quiet-timer.
- **`react/`** — `useChat.ts` binds one runtime per `threadId` to React via `useSyncExternalStore` (switching threadId tears down + recreates the runtime so SSE/argsBuffer can't leak). The other `use*` hooks are thin selectors/queries (permission mode, model, context, plan, progress phases, statuses, files, skills).

**Run discovery / attach** (how the UI picks up a server-started run, e.g. a scheduled task): `GET /conversations/status` → `useThreadStatuses` (5 s poll, in Sidebar) → `useActiveRunForThread` → TaskView's attach effect calls `attachToRun(runId)`, which sets `isRunning=true` and connects the resumable SSE.

**Message queue** (`src/features/task/MessageQueueContext.tsx`): an app-level, per-thread queue that survives navigation. While a run streams the composer is gated (`isBusy = isRunning || pendingInterrupts.length > 0 || activeRun !== null`) and Enter routes to `queue.add`; TaskView's auto-flush effect pops the head and sends on the `isRunning` true→false transition (skipped if the user hit Stop, via `userCancelled`). A `send()` that races a server-started run gets a 409 → `RunInProgressError` → re-queued instead of erroring.

## Critical conventions

1. **Tauri plugin versions are version-locked across Cargo and npm.** `tauri-plugin-shell` Rust crate version MUST equal `@tauri-apps/plugin-shell` npm major+minor. Same for `tauri-plugin-store`. When upgrading one side, upgrade the other in the same commit, or the plugin IPC will fail at runtime.

2. **Capability uses `shell:allow-spawn`, NOT `shell:allow-execute`.** The sidecar is long-running. Allow-execute is for run-to-completion processes only. The arg validators in `src-tauri/capabilities/default.json` constrain `--port=` and `--token=` formats — the token generator MUST use `rand::distr::Alphanumeric` to match `[A-Za-z0-9]+`.

3. **Vite `build.target = "esnext"`** — do NOT downgrade to `safari13`/`safari14`. esbuild can't downlevel shadcn/CVA's object rest destructuring, and Tauri v2's WebView baseline already supports modern JS.

4. **`@tailwindcss/node` requires explicit `esbuild` devDep.** Already in `package.json`. If you ever remove it, Vite build will fail with `Cannot find package 'esbuild'`.

5. **shadcn config:** `components.json` style is `radix-nova` (modern equivalent of the old `new-york` style). Alias `@/*` → `./src/*`. Add new components with `bunx shadcn@latest add <component>`.

6. **Sidecar binaries are gitignored** (`src-tauri/binaries/agent-studio-sidecar*`). `tauri build` requires the host-triple binary to exist — `beforeBuildCommand` runs `build:sidecar` to ensure that. `tauri dev` does NOT; use `bun run tauri:dev` (which prefixes `build:sidecar -- --host-only`) rather than raw `tauri dev`.

7. **Styling MUST go through the 3-tier design token system.** Whenever you write component CSS, apply a Tailwind class for color/spacing/radius, or pick any style value — first consult the `design-tokens` skill. The chain is `src/styles/primitives/` → `src/styles/semantic/` → `src/styles/components/` → `src/styles/shadcn-alias.css` → Tailwind utility via `@theme inline` in `src/index.css`. Theme is single-axis (`data-mode="light|dark"`, no `data-theme`). Hardcoding hex / raw HSL anywhere in `src/components/` or `src/features/` is forbidden — components reference **semantic** tokens (`var(--brand-100)`, `var(--bg-100)`, etc) which flow through to primitives. Direct primitive references (e.g., `var(--color-orange-500)`) are allowed ONLY in narrow "categorical palette picker" cases per the design-tokens skill exception clause.

8. **反 AI slop（必守）：** ❌ 紫色渐变 / ❌ emoji 装饰 icon / ❌ 圆角左 border 色条 / ❌ SVG 画的头像。改用：单一 brand-100 橙色 / lucide-react inline SVG / InitialsAvatar 字母方块。code review 期间任一条违反 = block，不是 nit。Anthropic 视觉身份是克制。

9. **Tests run on Bun's runner, not vitest** — every `*.test.ts(x)` (frontend AND sidecar) imports `bun:test`. Run with `bun test`. There is no vitest config; invoking these under vitest fails with `Cannot find package 'bun:test'`.

10. **One live run per thread is an invariant.** `POST /runs` and `/threads/:id/regenerate` reject with **409 `{error:"run_in_progress", activeRunId}`** when the thread already has a `running`/`awaiting_approval` run (`store.getThreadActiveRun`). The frontend treats this 409 cooperatively (`RunInProgressError` → re-queue), never as an error banner. Don't add a code path that starts a second concurrent run — two runs resuming the same SDK session corrupts the conversation.

11. **`run_events` is append-only and seq-ordered.** SSE resume/attach relies on `?after=<seq>` replay. Persist run output only through `store.appendEvent` (which bumps `seq`/`last_seq` atomically and signals streamers), and flush buffered messages **only at run terminal** — mid-run flushes duplicate turns after cross-session resume.

## Skills

Project skills live under `.claude/skills/`:
- `design-tokens` — **always invoke before any styling change.** Enforces the 3-tier token discipline (primitives / semantic / components) and gates new token decisions.
- `ai-elements` (vercel/ai-elements) — UI primitives for AI chat/agent UX. Required reading before installing or reconciling any ai-elements component.
- `vercel-react-best-practices` (vercel-labs/agent-skills) — React performance rules.
- `claude-agent-sdk-reference` — authoritative TypeScript reference for `@anthropic-ai/claude-agent-sdk` (query/startup/tool, sandbox, hooks, canUseTool, sessions, MCP, all message + tool schemas, plus usage recipes). Consult before writing or modifying code that touches the SDK — especially anything in `sidecar/src/agui/provider-claude/`.
- `theme-creator` — how to author + register a new brand theme on the `data-brand` axis (required color tokens, contrast rules, adding a primitive hue, optional font swap). Use when adding a theme color / 主题色 / skin under `src/styles/themes/`. Pairs with `design-tokens` (which governs the underlying token tiers).
- `skill-creator` (anthropics/skills) — meta-skill for authoring new skills.

Consult these when relevant; they are part of the project's documented context.
