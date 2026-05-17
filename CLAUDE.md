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
```

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

## Critical conventions

1. **Tauri plugin versions are version-locked across Cargo and npm.** `tauri-plugin-shell` Rust crate version MUST equal `@tauri-apps/plugin-shell` npm major+minor. Same for `tauri-plugin-store`. When upgrading one side, upgrade the other in the same commit, or the plugin IPC will fail at runtime.

2. **Capability uses `shell:allow-spawn`, NOT `shell:allow-execute`.** The sidecar is long-running. Allow-execute is for run-to-completion processes only. The arg validators in `src-tauri/capabilities/default.json` constrain `--port=` and `--token=` formats — the token generator MUST use `rand::distr::Alphanumeric` to match `[A-Za-z0-9]+`.

3. **Vite `build.target = "esnext"`** — do NOT downgrade to `safari13`/`safari14`. esbuild can't downlevel shadcn/CVA's object rest destructuring, and Tauri v2's WebView baseline already supports modern JS.

4. **`@tailwindcss/node` requires explicit `esbuild` devDep.** Already in `package.json`. If you ever remove it, Vite build will fail with `Cannot find package 'esbuild'`.

5. **shadcn config:** `components.json` style is `radix-nova` (modern equivalent of the old `new-york` style). Alias `@/*` → `./src/*`. Add new components with `bunx shadcn@latest add <component>`.

6. **Sidecar binaries are gitignored** (`src-tauri/binaries/agent-studio-sidecar*`). `tauri build` requires the host-triple binary to exist — `beforeBuildCommand` runs `build:sidecar` to ensure that. `tauri dev` does NOT; use `bun run tauri:dev` (which prefixes `build:sidecar -- --host-only`) rather than raw `tauri dev`.

7. **Styling MUST go through the 3-tier design token system.** Whenever you write component CSS, apply a Tailwind class for color/spacing/radius, or pick any style value — first consult the `design-tokens` skill. The chain is `src/styles/primitives/` → `src/styles/semantic/` → `src/styles/components/` → `src/styles/shadcn-alias.css` → Tailwind utility via `@theme inline` in `src/index.css`. Theme is single-axis (`data-mode="light|dark"`, no `data-theme`). Hardcoding hex / raw HSL anywhere in `src/components/` or `src/features/` is forbidden — components reference **semantic** tokens (`var(--brand-100)`, `var(--bg-100)`, etc) which flow through to primitives. Direct primitive references (e.g., `var(--color-orange-500)`) are allowed ONLY in narrow "categorical palette picker" cases per the design-tokens skill exception clause.

8. **反 AI slop（必守）：** ❌ 紫色渐变 / ❌ emoji 装饰 icon / ❌ 圆角左 border 色条 / ❌ SVG 画的头像。改用：单一 brand-100 橙色 / lucide-react inline SVG / InitialsAvatar 字母方块。code review 期间任一条违反 = block，不是 nit。Anthropic 视觉身份是克制。

## Skills

Project skills live under `.claude/skills/`:
- `design-tokens` — **always invoke before any styling change.** Enforces the 3-tier token discipline (primitives / semantic / components) and gates new token decisions.
- `ai-elements` (vercel/ai-elements) — UI primitives for AI chat/agent UX. Required reading before installing or reconciling any ai-elements component.
- `vercel-react-best-practices` (vercel-labs/agent-skills) — React performance rules.
- `skill-creator` (anthropics/skills) — meta-skill for authoring new skills.

Consult these when relevant; they are part of the project's documented context.
