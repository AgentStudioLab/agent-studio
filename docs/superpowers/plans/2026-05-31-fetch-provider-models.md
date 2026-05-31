# Fetch Provider Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings-page flow that fetches model ids from the configured custom provider and makes them selectable.

**Architecture:** The sidecar owns provider state, so it exposes a POST endpoint that fetches `{baseUrl}/v1/models`, normalizes model entries, saves them as `customModels`, and returns the updated provider. The React settings page calls that endpoint, updates the JSON editor, and renders a model selector from the fetched list; existing `ModelPicker` consumers continue reading `/models`.

**Tech Stack:** Bun tests, Hono sidecar routes, React, TanStack Query, existing shadcn UI controls.

---

### Task 1: Sidecar Fetch Route

**Files:**
- Modify: `sidecar/src/routes/settings.ts`
- Test: `sidecar/src/routes/settings.test.ts`

- [ ] Write a failing Bun route test for `POST /settings/provider/fetch-models` using a stub fetch.
- [ ] Verify it fails because the route does not exist.
- [ ] Add model-fetch parsing and persistence to `settings.ts`.
- [ ] Verify the route test passes.

### Task 2: Frontend Data API

**Files:**
- Modify: `src/lib/data/settings.ts`

- [ ] Add `fetchProviderModels(patch)` that POSTs base URL, API key, and profile id to the new sidecar route.
- [ ] Return the updated `ProviderConfig`.

### Task 3: Settings UI

**Files:**
- Modify: `src/features/settings/sections/ModelSection.tsx`
- Modify: `src/i18n/locales/en/settings.json`
- Modify: `src/i18n/locales/zh/settings.json`

- [ ] Add local state for selected fetched model, fetching status, and fetch messages.
- [ ] Add a “fetch models” button near the custom model JSON editor.
- [ ] On success, update the JSON editor, selected model, provider cache, and `/models` query cache.
- [ ] Render a model select when fetched models exist.
- [ ] Add English and Chinese labels/messages.

### Task 4: Verification

**Files:**
- Verify: `sidecar/src/routes/settings.test.ts`
- Verify: TypeScript/build where feasible.

- [ ] Run the focused sidecar route test.
- [ ] Run the project build or targeted TypeScript check.
