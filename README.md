# Agent Studio

**English** | [简体中文](./README.zh-CN.md)

A desktop app for running, scheduling, and managing Claude agent conversations. Built on the [Claude Agent SDK](https://docs.claude.com/en/agent-sdk), it gives each conversation a real agent runtime — tool use with human-in-the-loop approval, a workspace sandbox, skills, scheduled (recurring) tasks, usage tracking, and an audit log — wrapped in a native Tauri shell.

> macOS and Windows only (no Linux — an explicit project decision).

## What it does

- **Tasks** — chat-style agent runs with live streaming, tool calls, and reasoning.
- **Human-in-the-loop** — mutation tools surface an approval card; a path-based workspace sandbox and a destructive-command guardrail (`rm -rf`, `git reset --hard`, …) sit underneath.
- **Scheduled tasks** — recurring agent runs defined via the `create_scheduled_task` MCP tool; a poll-based scheduler fires them in the background through the same run path.
- **Projects** — group conversations and per-project instructions.
- **Skills** — personal (`~/.agent-studio/skills`, `~/.claude/skills`) and built-in skills, toggleable per install.
- **Settings** — API key / base URL, default model, permission mode, allowed-tools allow-list, user profile.
- **Usage & audit** — token/cost aggregation and a redacted tool-audit log.

## Architecture

Three independent subprojects in one repo (**no workspaces**):

```
[ React UI (src/) ]
   │  invoke('get_sidecar_info') → { port, token }   (cached)
   │  fetch http://127.0.0.1:<port>/* + Bearer <token>  (+ SSE)
   ▼
[ Tauri Rust shell (src-tauri/) ]      [ Bun + Hono sidecar (sidecar/) ]
   spawns the sidecar with a random      HTTP/SSE server; runs the agent via
   port + token, manages persistence     the Claude Agent SDK; event-sourced
   (tauri-plugin-store)                   run log in SQLite
```

- **`src/`** — React 19 + TypeScript + Tailwind v4 + shadcn (Vite 8 / rolldown). The frontend AGUI runtime (`src/lib/agui/`) is a framework-agnostic chat state machine bound to React via `useSyncExternalStore`.
- **`src-tauri/`** — Tauri v2 Rust shell. Picks an unused port + 32-char token, spawns the sidecar, and owns persistence.
- **`sidecar/`** — Bun + Hono server compiled to a single native binary per platform. Houses the AGUI run engine: every run (interactive, regenerate, or scheduled) funnels through one `runWorker`, streams `RUN_STARTED → … → RUN_FINISHED/RUN_ERROR` events, and persists them to an append-only, seq-ordered `run_events` log that the UI can replay/resume over SSE.

For the full mental model (run lifecycle, provider bridge, message queue, conventions), see [`CLAUDE.md`](./CLAUDE.md).

## Prerequisites

- [Bun](https://bun.sh) (used as the package manager, dev runtime, test runner, and sidecar compiler)
- [Rust](https://rustup.rs) (stable) + the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (on macOS: Xcode Command Line Tools)
- An Anthropic API key (configured in-app under **Settings** on first launch)

## Getting started

```bash
bun install                # install frontend deps
cd sidecar && bun install  # install sidecar deps

# Full desktop app (frontend + Rust shell + sidecar)
bun run tauri:dev
```

On first launch, open **Settings** and enter your Anthropic API key (and optional base URL / default model).

### Other dev entry points

```bash
bun run dev                 # Vite frontend only → http://localhost:1420
cd sidecar && bun run dev   # sidecar standalone (dev token, port 4123)
```

`bun run tauri:dev` compiles the host-triple sidecar first (`build:sidecar --host-only`); don't run raw `tauri dev` (it won't build the binary).

## Building

```bash
bun run build               # tsc -b && vite build → dist/
bun run build:sidecar       # compile sidecar for all 3 targets
bun run tauri:build         # all sidecars + Tauri release build
cargo check --manifest-path src-tauri/Cargo.toml   # Rust typecheck
```

Sidecar build targets (handled by `scripts/build-sidecar.ts`):

| Bun target | Tauri triple |
|---|---|
| `bun-darwin-arm64` | `aarch64-apple-darwin` |
| `bun-darwin-x64` | `x86_64-apple-darwin` |
| `bun-windows-x64` | `x86_64-pc-windows-msvc` |

Sidecar binaries are gitignored; `tauri build` regenerates them via `beforeBuildCommand`.

## Testing

Tests run on **Bun's test runner** (not vitest) — both frontend and sidecar:

```bash
bun test                          # frontend (run from repo root)
cd sidecar && bun test            # sidecar
bun test path/to/file.test.ts     # single file
bun test -t "name substring"      # single test by name

# Typecheck (no emit)
bunx tsc --noEmit -p tsconfig.app.json   # frontend
cd sidecar && bunx tsc --noEmit          # sidecar
```

Every `*.test.ts(x)` imports from `bun:test`; there is no vitest in this repo.

## Project structure

```
src/          React frontend (feature-folder + co-location; no index.ts barrels)
  app/        app chrome + routing            lib/agui/   frontend AGUI runtime + React hooks
  features/   self-contained features          styles/    3-tier design-token system
src-tauri/    Tauri v2 Rust shell (spawns sidecar, persistence)
sidecar/      Bun + Hono server
  src/agui/core/             provider-agnostic AGUI run engine
  src/agui/provider-claude/  Claude Agent SDK bridge
  src/agui/store-sqlite/     event-sourced SQLite store
  src/routes/  HTTP/SSE surface   src/services/  threads, messages, scheduler, usage, …
scripts/      build-sidecar.ts (bun build --compile orchestration)
```

## Conventions

This repo has strict, documented conventions — read [`CLAUDE.md`](./CLAUDE.md) before contributing. Highlights:

- **Styling** goes through the 3-tier design-token system (`src/styles/`); no hardcoded hex/HSL in components.
- **One live run per thread** is an invariant (concurrent `POST /runs` → 409, cooperatively re-queued).
- **`run_events` is append-only**; persist run output only via `store.appendEvent` and flush messages only at run terminal.
- **Tauri plugin versions are version-locked** across Cargo and npm.
- Project-specific skills (`design-tokens`, `claude-agent-sdk-reference`, `ai-elements`, …) live under `.claude/skills/`.

## License

Proprietary — internal project. Not currently published under an open-source license.
