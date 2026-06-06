# Provider Connections and Multi-Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace active provider presets with provider connections, enabled model lists, and per-run provider/model selection.

**Architecture:** The sidecar upgrades `settings.provider` to v3 `{ defaultSelection, connections }` while preserving legacy v2 preset and v1 single-provider reads. New settings routes manage provider connections and enabled model ids. Frontend settings becomes a provider list with edit dialog, and chat sends `{ providerSelection: { providerId, modelId } }` instead of a bare model id.

**Tech Stack:** TypeScript, Bun test, Bun SQLite, Hono, React 19, TanStack Query, shadcn/ui, ai-elements, Tailwind v4 design tokens.

**Spec:** `docs/superpowers/specs/2026-06-06-provider-connections-models-design.md`

**Execution Progress**

| Task | Status | Last update | Notes |
|---|---|---|---|
| 1. Sidecar v3 provider connection store | done | 2026-06-06 | `cd sidecar && bun test src/services/providerSettings.test.ts` PASS: 32 pass, 0 fail; `cd sidecar && bunx tsc --noEmit` PASS |
| 2. Connection routes and targeted model refresh | done | 2026-06-06 | `cd sidecar && bun test src/services/providerSettings.test.ts src/routes/settings-provider.test.ts src/routes/settings.test.ts src/routes/models.test.ts` PASS: 57 pass, 0 fail; `cd sidecar && bunx tsc --noEmit` PASS |
| 3. Run providerSelection resolve | done | 2026-06-06 | `cd sidecar && bun test src/routes/runs.test.ts` PASS: 8 pass, 0 fail; `cd sidecar && bunx tsc --noEmit` PASS |
| 4. Frontend settings client v3 | done | 2026-06-06 | `bunx tsc --noEmit -p tsconfig.app.json` PASS |
| 5. Settings provider list and dialog UI | done | 2026-06-06 | `bun test src/features/settings/sections/ModelSection.test.tsx` PASS: 5 pass, 0 fail; `bunx tsc --noEmit -p tsconfig.app.json` PASS |
| 6. Conversation ProviderModelPicker | done | 2026-06-06 | `bun test src/features/task/ProviderModelPicker.test.tsx` PASS: 4 pass, 0 fail; `bunx tsc --noEmit -p tsconfig.app.json` PASS |
| 7. Verification and cleanup | done | 2026-06-06 | Sidecar targeted PASS: 57 pass, 0 fail; `cd sidecar && bun test src/routes/runs.test.ts` PASS: 8 pass, 0 fail; frontend targeted PASS: 10 pass, 0 fail; sidecar/frontend typechecks PASS; leftover scan reviewed |

---

## File Structure

- Modify `sidecar/src/services/providerSettings.ts`: add v3 connection types, migration from v2/v1, connection CRUD, enabled model management, default selection repair, run selection resolve.
- Modify `sidecar/src/services/providerSettings.test.ts`: add v3 migration, connection CRUD, enabled model, default selection, and compatibility tests.
- Modify `sidecar/src/routes/settings.ts`: add `/settings/provider/connections*`, `/settings/provider/default-selection`, and keep legacy preset/provider routes as compatibility wrappers where feasible.
- Modify `sidecar/src/routes/settings-provider.test.ts`: cover v3 route contracts and validation.
- Modify `sidecar/src/routes/models.ts`: preserve `/models` and `/models/refresh` as default-selection compatibility routes.
- Modify `sidecar/src/routes/models.test.ts`: cover default-selection behavior and `no_default_model`.
- Modify `sidecar/src/routes/runs.ts`, `sidecar/src/agent/runWorker.ts`, and provider factory/server wiring as needed: accept `providerSelection` and resolve selected provider/model.
- Modify AGUI runtime client files under `src/lib/agui/`: add `providerSelection` request type.
- Modify `src/lib/data/settings.ts`: expose v3 types and client methods.
- Replace `src/features/task/ProviderPresetPicker.tsx` with `src/features/task/ProviderModelPicker.tsx`.
- Modify `src/features/task/TaskMessageInput.tsx`, `src/features/task/TaskView.tsx`, and `src/features/new-task/NewTaskView.tsx`: use `ProviderModelPicker` and send providerSelection.
- Split `src/features/settings/sections/ModelSection.tsx` into list/dialog/model-selector helpers.
- Modify settings/task locale JSON files for new labels.

## Task 1: Sidecar v3 provider connection store

**Files:**
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `sidecar/src/services/providerSettings.test.ts`

- [ ] **Step 1: Write failing v3 migration tests**

Add tests that assert:

```ts
it("migrates v2 presets into v3 provider connections with enabled models", () => {
  const db = makeDb();
  db.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(
    "provider",
    JSON.stringify({
      version: 2,
      activePresetId: "preset-openai",
      presets: [
        {
          id: "preset-openai",
          name: "OpenAI",
          profileId: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "openai-key",
          remoteModels: [
            { id: "gpt-5.1", displayName: "GPT-5.1", description: "Remote" },
            { id: "gpt-5.1-mini", displayName: "GPT-5.1 Mini", description: "Remote" },
          ],
          remoteModelsProviderId: "openai",
          remoteModelsBaseUrl: "https://api.openai.com/v1",
          remoteModelsFetchedAt: "2026-06-06T00:00:00.000Z",
          selectedModelId: "gpt-5.1",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
        },
      ],
    }),
  );

  const settings = createProviderSettings(db, {});

  expect(settings.currentStoreVersion()).toBe(3);
  expect(settings.getDefaultSelection()).toEqual({
    providerId: "preset-openai",
    modelId: "gpt-5.1",
  });
  expect(settings.listConnections()[0]).toMatchObject({
    id: "preset-openai",
    name: "OpenAI",
    profileId: "openai",
    enabled: true,
    modelCount: 2,
    enabledModelCount: 1,
    defaultModelId: "gpt-5.1",
  });
  expect(settings.listEnabledModelSelections()).toEqual([
    expect.objectContaining({
      providerId: "preset-openai",
      modelId: "gpt-5.1",
      providerName: "OpenAI",
      modelLabel: "GPT-5.1",
    }),
  ]);
});
```

Add a second test for a missing provider row:

```ts
it("creates a default Anthropic connection with env fallback", () => {
  const settings = createProviderSettings(makeDb(), {
    apiKey: "env-key",
    baseUrl: "https://env.example",
  });

  const [connection] = settings.listConnections();
  expect(connection).toMatchObject({
    name: "Anthropic",
    profileId: "anthropic",
    enabled: true,
    hasApiKey: true,
  });
  expect(settings.resolveSelection()).toMatchObject({
    providerId: connection.id,
    modelId: connection.defaultModelId,
    apiKey: "env-key",
    baseUrl: "https://env.example",
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts -t "v3 provider connections|default Anthropic connection"
```

Expected: FAIL because v3 methods do not exist.

- [ ] **Step 3: Add v3 types and compatibility aliases**

In `providerSettings.ts`, add:

```ts
export interface ProviderModelSelection {
  providerId: string;
  modelId: string;
}

export interface ProviderConnection {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  remoteModels: ProfileModel[];
  remoteModelsProviderId: ProviderProfileId | "";
  remoteModelsBaseUrl: string;
  remoteModelsFetchedAt: string;
  enabledModelIds: string[];
  defaultModelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedProviderSettingsV3 {
  version: 3;
  defaultSelection: ProviderModelSelection | null;
  connections: ProviderConnection[];
}

export interface ProviderConnectionSummary {
  id: string;
  name: string;
  profileId: ProviderProfileId;
  providerLabel: string;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  modelCount: number;
  enabledModelCount: number;
  defaultModelId: string | null;
  remoteModelsFetchedAt: string;
  agentRuntime: AgentRuntime;
  supportsRemoteModels: boolean;
  compatibilityNote?: string;
}

export interface EnabledModelOption {
  providerId: string;
  providerName: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  modelDescription: string;
  agentRuntime: AgentRuntime;
  compatibilityNote?: string;
}

export interface ResolvedProviderForRun extends ResolvedProvider {
  providerId: string;
  providerName: string;
  modelId: string;
}
```

Keep existing `ProviderPreset*` exports temporarily as compatibility aliases for route/client migration.

- [ ] **Step 4: Implement v3 normalization and migration**

Add `normalizeConnection`, `normalizeV3Store`, `v2ToV3`, `legacyToV3`, `repairStore`, and make `readRow()` return `PersistedProviderSettingsV3`.

Rules:

```ts
function enabledModelIdsForMigratedPreset(preset: ProviderPreset): string[] {
  return preset.selectedModelId ? [preset.selectedModelId] : [];
}

function defaultSelectionForStore(store: PersistedProviderSettingsV3): ProviderModelSelection | null {
  for (const connection of store.connections) {
    if (!connection.enabled) continue;
    const modelId = connection.defaultModelId ?? connection.enabledModelIds[0] ?? null;
    if (modelId) return { providerId: connection.id, modelId };
  }
  return null;
}
```

`repairStore()` must:

- Drop invalid empty connection ids.
- Ensure at least one connection exists.
- Remove enabled model ids that are not present in the resolved model list.
- Ensure each enabled connection has a valid `defaultModelId`.
- Ensure `defaultSelection` points to an enabled connection and enabled model, or repair to first available selection.

- [ ] **Step 5: Implement v3 service methods**

Update `ProviderSettingsState` with:

```ts
currentStoreVersion(): 3;
getDefaultSelection(): ProviderModelSelection | null;
listConnections(): ProviderConnectionSummary[];
getConnection(id: string): ResolvedProviderConnection | null;
createConnection(input?: CreateProviderConnectionInput): ResolvedProviderConnection;
updateConnection(id: string, patch: ProviderConnectionPatch): ResolvedProviderConnection | null;
deleteConnection(id: string): { ok: true } | { ok: false; error: "provider_connection_not_found" | "cannot_delete_last_connection" };
setEnabledModels(id: string, modelIds: string[], defaultModelId?: string | null): ResolvedProviderConnection | null;
setDefaultSelection(selection: ProviderModelSelection | null): ProviderModelSelection | null;
listEnabledModelSelections(): EnabledModelOption[];
resolveSelection(selection?: ProviderModelSelection | null): ResolvedProviderForRun;
```

Keep compatibility:

- `current()` returns `resolveSelection()`.
- `listPresets()` maps connection summaries to old preset-shaped summaries.
- `getPreset()` delegates to `getConnection()`.
- `update()` updates the default selection connection.

- [ ] **Step 6: Run provider settings tests**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts
```

Expected: PASS.

## Task 2: Connection routes and targeted model refresh

**Files:**
- Modify: `sidecar/src/routes/settings.ts`
- Modify: `sidecar/src/routes/models.ts`
- Modify: `sidecar/src/routes/settings-provider.test.ts`
- Modify: `sidecar/src/routes/models.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests for:

```ts
it("GET /settings/provider returns v3 connections and enabled models", async () => {
  const res = await app.request("/settings/provider");
  expect(res.status).toBe(200);
  const body = await res.json() as {
    version: 3;
    connections: Array<{ id: string; modelCount: number; enabledModelCount: number }>;
    enabledModels: Array<{ providerId: string; modelId: string }>;
    defaultSelection: { providerId: string; modelId: string } | null;
  };
  expect(body.version).toBe(3);
  expect(body.connections.length).toBeGreaterThan(0);
});

it("refreshes models for a non-default provider connection", async () => {
  const created = provider.createConnection({
    name: "Inactive OpenAI",
    profileId: "openai",
    apiKey: "key-b",
    enabled: true,
  });

  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    data: [{ id: "gpt-non-default" }],
  }), { status: 200, headers: { "Content-Type": "application/json" } }));

  const res = await app.request(
    `/settings/provider/connections/${created.providerId}/models/refresh`,
    { method: "POST" },
  );

  expect(res.status).toBe(200);
  expect(provider.getConnection(created.providerId)?.models.map((m) => m.id)).toEqual(["gpt-non-default"]);
  expect(provider.getDefaultSelection()?.providerId).not.toBe(created.providerId);
});
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd sidecar && bun test src/routes/settings-provider.test.ts src/routes/models.test.ts -t "v3 connections|non-default provider connection"
```

Expected: FAIL because routes are missing.

- [ ] **Step 3: Add v3 route helpers**

In `settings.ts`, add validators for connection patches, enabled model ids, and provider model selection.

- [ ] **Step 4: Add v3 routes**

Add:

- `POST /settings/provider/connections`
- `GET /settings/provider/connections/:id`
- `POST /settings/provider/connections/:id`
- `DELETE /settings/provider/connections/:id`
- `POST /settings/provider/connections/:id/models/refresh`
- `POST /settings/provider/connections/:id/models/enabled`
- `POST /settings/provider/default-selection`

Use `listModelsForProvider()` for targeted refresh.

- [ ] **Step 5: Update `/models` compatibility**

`GET /models` returns enabled models for `defaultSelection` when present, otherwise all enabled models flattened.

`POST /models/refresh` refreshes the default selection provider and returns `no_default_model` when missing.

- [ ] **Step 6: Run route tests**

Run:

```bash
cd sidecar && bun test src/routes/settings-provider.test.ts src/routes/settings.test.ts src/routes/models.test.ts
```

Expected: PASS.

## Task 3: Run providerSelection resolve

**Files:**
- Modify: `sidecar/src/routes/runs.ts`
- Modify: `sidecar/src/agent/runWorker.ts`
- Modify: `sidecar/src/server.ts`
- Modify tests under `sidecar/src/routes/`

- [ ] **Step 1: Write failing run route test**

Add a route-level test asserting `POST /runs` accepts:

```json
{
  "providerSelection": { "providerId": "...", "modelId": "..." }
}
```

and the provider factory receives the selected provider/model, not global default.

- [ ] **Step 2: Verify failure**

Run the targeted runs test. Expected: FAIL because the request type ignores `providerSelection`.

- [ ] **Step 3: Add `ProviderModelSelection` to run request types**

Update API schemas and worker payload so `providerSelection` travels from route to provider construction.

- [ ] **Step 4: Resolve provider per run**

In server/provider factory path, use `providerSettings.resolveSelection(req.providerSelection)` and pass `modelId` as the default model for that run.

If invalid, produce `RUN_ERROR` or HTTP validation error according to existing route pattern.

- [ ] **Step 5: Run sidecar run tests**

Run the targeted runs tests plus provider settings tests.

## Task 4: Frontend settings client v3

**Files:**
- Modify: `src/lib/data/settings.ts`
- Modify related tests if present.

- [ ] **Step 1: Write failing client type/behavior tests**

Add or update tests so `getProvider()` expects `version`, `connections`, `enabledModels`, and `defaultSelection`.

- [ ] **Step 2: Implement v3 types and methods**

Add:

- `ProviderModelSelection`
- `ProviderConnectionSummary`
- `EnabledModelOption`
- `ProviderConnectionConfig`
- `createProviderConnection`
- `getProviderConnection`
- `updateProviderConnection`
- `deleteProviderConnection`
- `refreshProviderConnectionModels`
- `setProviderConnectionEnabledModels`
- `setDefaultProviderSelection`

Keep old functions as wrappers where current frontend files still compile.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS or exposes UI files for Task 5/6.

## Task 5: Settings provider list and dialog UI

**Files:**
- Modify: `src/features/settings/sections/ModelSection.tsx`
- Create: `src/features/settings/sections/ProviderConnectionList.tsx`
- Create: `src/features/settings/sections/ProviderConnectionDialog.tsx`
- Create: `src/features/settings/sections/ProviderModelSelector.tsx`
- Modify: `src/features/settings/sections/ModelSection.test.tsx`
- Modify: `src/i18n/locales/en/settings.json`
- Modify: `src/i18n/locales/zh/settings.json`

- [ ] **Step 1: Write failing UI tests**

Tests:

- ModelSection renders provider rows and no flat provider form.
- `+ Add model` opens dialog.
- Edit opens dialog with provider details.
- Refresh in dialog works for non-default provider.
- Selecting multiple model checkboxes calls enabled models API.

- [ ] **Step 2: Implement list shell**

Use token-backed classes only (`bg-card`, `border-border`, `text-muted-foreground`, `hover:bg-muted`, `rounded-md`).

- [ ] **Step 3: Implement dialog**

Use existing shadcn dialog/select/input/button components. No raw colors.

- [ ] **Step 4: Implement model selector**

Search + checkbox list + default radio/select. Keep behavior simple.

- [ ] **Step 5: Run UI tests and typecheck**

Run:

```bash
bun test src/features/settings/sections/ModelSection.test.tsx
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS.

## Task 6: Conversation ProviderModelPicker

**Files:**
- Rename/modify: `src/features/task/ProviderPresetPicker.tsx` -> `src/features/task/ProviderModelPicker.tsx`
- Modify: `src/features/task/ProviderPresetPicker.test.tsx` -> `src/features/task/ProviderModelPicker.test.tsx`
- Modify: `src/features/task/TaskMessageInput.tsx`
- Modify: `src/features/task/TaskView.tsx`
- Modify: `src/features/new-task/NewTaskView.tsx`
- Modify: `src/lib/agui/runtime/api.ts`
- Modify: `src/lib/agui/runtime/runtime.ts`
- Modify: `src/lib/agui/react/useChat.ts`

- [ ] **Step 1: Write failing picker tests**

Tests:

- Groups enabled models by provider.
- Selecting a model calls `onChange({ providerId, modelId })`.
- Disabled while run active.
- Empty state shows "Configure models".

- [ ] **Step 2: Add providerSelection to AGUI client types**

Update `PostRunRequest`, `PostRegenerateRequest`, runtime send options, and `useChat` send/regenerate wrappers.

- [ ] **Step 3: Implement ProviderModelPicker**

Read `getProvider()` and use `enabledModels` + `defaultSelection`.

- [ ] **Step 4: Wire TaskView**

Keep selected provider selection in TaskView state before first run. Send it in `send()` and `regenerate()`. Lock after history exists or run active.

- [ ] **Step 5: Run picker tests and typecheck**

Run:

```bash
bun test src/features/task/ProviderModelPicker.test.tsx
bunx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS.

## Task 7: Verification and cleanup

**Files:**
- Modify: this plan progress table.
- Inspect all changed files.

- [ ] **Step 1: Sidecar targeted tests**

Run:

```bash
cd sidecar && bun test src/services/providerSettings.test.ts src/routes/settings-provider.test.ts src/routes/settings.test.ts src/routes/models.test.ts
```

- [ ] **Step 2: Frontend targeted tests**

Run:

```bash
bun test src/lib/models.test.tsx src/features/settings/sections/ModelSection.test.tsx src/features/task/ProviderModelPicker.test.tsx
```

- [ ] **Step 3: Typechecks**

Run:

```bash
cd sidecar && bunx tsc --noEmit
bunx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 4: Search compatibility leftovers**

Run:

```bash
rg -n "activePreset|ProviderPreset|ProviderPresetPicker|selectedModelId|providerSelection|ModelPicker" src sidecar
```

Expected:

- `ProviderPreset*` appears only in compatibility code/tests or removed.
- `selectedModelId` remains only as provider connection default model or legacy compatibility.
- `ModelPicker` may remain only in explicitly deferred scheduled/agent workspace flows.

- [ ] **Step 5: Final git status**

Run:

```bash
git status --short
```

Do not stage or commit unless explicitly requested.

## Self-Review

Spec coverage:

- ProviderConnection v3 data model: Task 1.
- Non-default refresh and enabled models: Task 2.
- Per-run providerSelection: Task 3.
- Frontend data client: Task 4.
- AionUI-style settings list/dialog: Task 5.
- Conversation concrete model picker: Task 6.
- Verification: Task 7.

Placeholder scan:

- No TODO/TBD placeholders.
- Tasks include exact files and commands. Some tests are described behaviorally because exact current test helpers may differ after Task 1/2 rewrites; implementers must write concrete Bun tests before production code.

Type consistency:

- `ProviderConnection`, `ProviderModelSelection`, `EnabledModelOption`, and `providerSelection` names match the spec.
