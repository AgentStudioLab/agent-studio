# 桌面端官方 AI 聊天扣积分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 桌面端内置不可编辑的官方 AI 服务商，官方模型请求统一经官网服务端 AI 中转接口，成功完成一次回复扣 1 积分并刷新客户端余额。

**Architecture:** 官网服务端负责读取 `AI_PROXY_BASE_URL` / `AI_PROXY_API_KEY`、调用 OpenAI-compatible 中转站、校验余额、完成后写入现有 `credit` 消费流水。桌面 sidecar 增加固定 `official` provider 和只读 provider settings；官方 run 通过一次性 desktop access token 请求官网 NDJSON chat API。前端只在选择官方 provider 时要求官网登录、传递 token、在终态刷新积分，并对积分不足显示充值提示。

**Tech Stack:** Next.js 16 App Router、Bun test、Drizzle credit model、Hono sidecar、React 19、TypeScript、AGUI event runtime。

---

## File Structure

### 官网仓库 `/Users/starchen/.config/superpowers/worktrees/agent-studio-website/official-ai-credits`

- Create: `src/shared/services/official-ai-proxy.ts`
  - 负责读取代理配置、规范化 URL、拉取模型、调用 chat completions、把 OpenAI usage 转成桌面协议 usage。
- Create: `src/shared/services/official-ai-proxy.test.ts`
  - 覆盖 env 缺失、模型归一化、chat 文本/usage 解析、上游失败。
- Create: `src/app/api/desktop/ai/models/route.ts`
  - `GET /api/desktop/ai/models`，不要求 desktop bearer token，返回 `{ models }`。
- Create: `src/app/api/desktop/ai/models/route.test.ts`
  - 覆盖成功、缺配置、上游失败、不泄露 API key。
- Create: `src/app/api/desktop/ai/chat/route.ts`
  - `POST /api/desktop/ai/chat`，要求 desktop bearer token，余额检查、调用中转、成功后扣 1 积分，返回 NDJSON。
- Create: `src/app/api/desktop/ai/chat/route.test.ts`
  - 覆盖未登录、余额不足不调上游、上游失败不扣费、成功扣费、同 runId 幂等。
- Modify: `.env.example`
  - 增加 `AI_PROXY_BASE_URL` 和 `AI_PROXY_API_KEY` 示例键，不提交真实密钥。

### 桌面仓库 `/Users/starchen/.config/superpowers/worktrees/agent-studio/official-ai-credits`

- Modify: `sidecar/src/services/providerSettings.ts`
  - 增加 `OFFICIAL_PROVIDER_ID`、`managed` 字段、官方连接、官方模型列表注入、官方连接只读保护。
- Modify: `sidecar/src/services/providerSettings.test.ts`
  - 覆盖官方连接默认存在、不可编辑删除、默认模型、custom provider 不受影响。
- Create: `sidecar/src/services/officialService.ts`
  - 保存内存中的官网 origin、官方模型缓存；校验 origin；拉取 `/api/desktop/ai/models`。
- Create: `sidecar/src/services/officialService.test.ts`
  - 覆盖 origin 校验、模型缓存、缺 origin fallback。
- Modify: `sidecar/src/routes/settings.ts`
  - 增加 `POST /settings/official-service`；官方模型 refresh 只刷新 catalog，不允许修改 enabled subset。
- Modify: `sidecar/src/routes/settings.test.ts`
  - 覆盖 official-service route、官方连接 update/delete/disable 被拒绝。
- Create: `sidecar/src/agui/provider-official/official-provider.ts`
  - 请求官网 `POST /api/desktop/ai/chat`，解析 NDJSON，转换成 AGUI provider events。
- Create: `sidecar/src/agui/provider-official/official-provider.test.ts`
  - 覆盖 text delta、usage、billing、done、insufficient credits、abort。
- Modify: `sidecar/src/agui/core/provider-types.ts`
  - `RunContext` 增加 `officialAuthToken`、`officialWebsiteOrigin`。
- Modify: `sidecar/src/routes/runs.ts`
  - 解析 run request 的官方 token/origin 字段。
- Modify: `sidecar/src/agent/runWorker.ts`
  - 将官方 token/origin 传入 provider run context。
- Modify: `sidecar/src/server.ts`
  - 初始化 official service；`official` selection 使用 official provider，其它 provider 沿用现有逻辑。
- Modify: `sidecar/src/routes/models.ts`
  - 模型列表包含官方服务商托管模型。
- Modify: `src/features/auth/desktop-auth-client.ts`
  - 增加 `syncOfficialService()` sidecar helper，并复用 `getWebsiteOrigin()`。
- Modify: `src/features/auth/AuthProvider.tsx`
  - 登录态启动后同步官网 origin 到 sidecar。
- Modify: `src/lib/agui/runtime/api.ts`
  - run 请求类型增加 `officialAuthToken`、`officialWebsiteOrigin`。
- Modify: `src/lib/agui/runtime/runtime.ts`
  - send/regenerate request 转发官方字段。
- Modify: `src/lib/agui/react/useChat.ts`
  - 暴露 send options 所需字段。
- Modify: `src/features/task/TaskView.tsx`
  - 官方 provider 发送前确保登录、获取 token、终态刷新积分。
- Modify: `src/features/new-task/NewTaskView.tsx`
  - 新任务发送走同样官方鉴权和 token 传递。
- Modify: `src/features/task/ChatStream.tsx`
  - 对 `INSUFFICIENT_CREDITS` 展示充值提示和官网按钮。
- Modify: `src/features/task/ProviderModelPicker.tsx`
  - 托管 provider 显示锁定态，避免编辑入口。
- Modify: `src/features/settings/*provider*`
  - 官方连接隐藏编辑/删除/禁用动作。
- Modify: `src/i18n/locales/zh/task.json`
  - 增加积分不足中文文案。
- Modify: `src/i18n/locales/en/task.json`
  - 增加积分不足英文文案。

---

## Task 1: 官网 official AI proxy service

**Files:**
- Create: `src/shared/services/official-ai-proxy.test.ts`
- Create: `src/shared/services/official-ai-proxy.ts`

- [ ] **Step 1: Write failing service tests**

```ts
import { afterEach, describe, expect, mock, test } from 'bun:test';

import {
  OfficialAiProxyConfigError,
  fetchOfficialModels,
  requestOfficialChatCompletion,
} from './official-ai-proxy';

const originalEnv = {
  AI_PROXY_BASE_URL: process.env.AI_PROXY_BASE_URL,
  AI_PROXY_API_KEY: process.env.AI_PROXY_API_KEY,
};

afterEach(() => {
  process.env.AI_PROXY_BASE_URL = originalEnv.AI_PROXY_BASE_URL;
  process.env.AI_PROXY_API_KEY = originalEnv.AI_PROXY_API_KEY;
  mock.restore();
});

describe('official ai proxy service', () => {
  test('normalizes upstream models', async () => {
    process.env.AI_PROXY_BASE_URL = 'https://proxy.example.com/v1/';
    process.env.AI_PROXY_API_KEY = 'secret';
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://proxy.example.com/v1/models');
      expect(init?.headers).toEqual({
        Authorization: 'Bearer secret',
      });
      return Response.json({
        data: [
          { id: 'gpt-5-mini', object: 'model', owned_by: 'agent-studio' },
          { id: 'claude-opus', display_name: 'Claude Opus' },
        ],
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const models = await fetchOfficialModels();

    expect(models).toEqual([
      { id: 'gpt-5-mini', displayName: 'gpt-5-mini', description: 'agent-studio' },
      { id: 'claude-opus', displayName: 'Claude Opus', description: undefined },
    ]);
  });

  test('throws stable config error when env is missing', async () => {
    delete process.env.AI_PROXY_BASE_URL;
    delete process.env.AI_PROXY_API_KEY;

    await expect(fetchOfficialModels()).rejects.toBeInstanceOf(
      OfficialAiProxyConfigError
    );
  });

  test('requests non-stream chat completion and returns text with usage', async () => {
    process.env.AI_PROXY_BASE_URL = 'https://proxy.example.com';
    process.env.AI_PROXY_API_KEY = 'secret';
    globalThis.fetch = mock(async () =>
      Response.json({
        choices: [{ message: { role: 'assistant', content: 'hello' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      })
    ) as typeof fetch;

    const result = await requestOfficialChatCompletion({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toEqual({
      text: 'hello',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      rawUsage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
    });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/shared/services/official-ai-proxy.test.ts`

Expected: FAIL because `src/shared/services/official-ai-proxy.ts` does not exist.

- [ ] **Step 3: Implement official AI proxy service**

Implement:

```ts
export type OfficialAiModel = {
  id: string;
  displayName: string;
  description?: string;
};

export type OfficialAiUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type OfficialChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export class OfficialAiProxyConfigError extends Error {
  code = 'official_ai_proxy_not_configured' as const;
}

export class OfficialAiProxyUpstreamError extends Error {
  code = 'official_ai_upstream_failed' as const;
}
```

The service must:
- Read `process.env.AI_PROXY_BASE_URL` and `process.env.AI_PROXY_API_KEY`.
- Normalize base URL so both `https://host` and `https://host/v1/` call `/v1/models` and `/v1/chat/completions`.
- Send `Authorization: Bearer <AI_PROXY_API_KEY>`.
- Return model data as `{ id, displayName, description }`.
- Send chat request with `stream: false`.
- Convert OpenAI usage keys to camelCase.

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/shared/services/official-ai-proxy.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit website service**

```bash
git add src/shared/services/official-ai-proxy.ts src/shared/services/official-ai-proxy.test.ts
git commit -m "feat: add official ai proxy service"
```

---

## Task 2: 官网 desktop official AI API routes

**Files:**
- Create: `src/app/api/desktop/ai/models/route.test.ts`
- Create: `src/app/api/desktop/ai/models/route.ts`
- Create: `src/app/api/desktop/ai/chat/route.test.ts`
- Create: `src/app/api/desktop/ai/chat/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing route tests**

Tests must cover:
- `GET /api/desktop/ai/models` returns `{ code: 0, data: { models } }`.
- Missing proxy env returns code `official_ai_proxy_not_configured`.
- Upstream failure returns code `official_ai_models_failed`.
- `POST /api/desktop/ai/chat` without desktop bearer returns auth error.
- Balance `< 1` returns NDJSON error `insufficient_credits` and does not call upstream.
- Upstream failure returns NDJSON error `official_ai_upstream_failed` and does not deduct.
- Successful completion calls `consumeDesktopCredits` with `amount: 1`, `scene: 'desktop_ai_chat'`, `idempotencyKey: ai-chat:<runId>`, metadata containing `runId`, `threadId`, `model`, `provider: 'official'`.
- Successful completion returns NDJSON lines `text_delta`, `usage`, `billing`, `done`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test \
  src/app/api/desktop/ai/models/route.test.ts \
  src/app/api/desktop/ai/chat/route.test.ts
```

Expected: FAIL because the new routes do not exist.

- [ ] **Step 3: Implement routes**

Implementation rules:
- Use existing `withDesktopCors`, `requireDesktopAuth`, `desktopApiError`, `respData`, and `respErr` helpers.
- `models` route must not call `requireDesktopAuth`.
- `chat` route must parse JSON body `{ runId, threadId, model, messages }`.
- Validate `runId`, `model`, and at least one message; invalid body returns NDJSON `error`.
- Use `getRemainingCredits(userId)` before upstream; if remaining `< 1`, return NDJSON `{"type":"error","code":"insufficient_credits","message":"insufficient credits","remainingCredits":0}`.
- On upstream success, call `consumeDesktopCredits({ userId, amount: 1, scene: 'desktop_ai_chat', idempotencyKey: `ai-chat:${runId}`, description: `Official AI chat: ${model}`, metadata })`.
- Return `Content-Type: application/x-ndjson; charset=utf-8`.
- Add `.env.example` keys:
  - `AI_PROXY_BASE_URL=`
  - `AI_PROXY_API_KEY=`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test \
  src/shared/services/official-ai-proxy.test.ts \
  src/app/api/desktop/ai/models/route.test.ts \
  src/app/api/desktop/ai/chat/route.test.ts \
  src/shared/models/credit.test.ts \
  src/shared/lib/desktop-api.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit website API**

```bash
git add .env.example src/app/api/desktop/ai src/shared/services/official-ai-proxy.ts src/shared/services/official-ai-proxy.test.ts
git commit -m "feat: add official desktop ai api"
```

---

## Task 3: Sidecar official service and provider settings

**Files:**
- Create: `sidecar/src/services/officialService.test.ts`
- Create: `sidecar/src/services/officialService.ts`
- Modify: `sidecar/src/services/providerSettings.test.ts`
- Modify: `sidecar/src/services/providerSettings.ts`
- Modify: `sidecar/src/routes/settings.test.ts`
- Modify: `sidecar/src/routes/settings.ts`
- Modify: `sidecar/src/routes/models.ts`

- [ ] **Step 1: Write failing sidecar settings tests**

Tests must assert:
- `createOfficialService()` rejects `ftp://` and accepts `http://127.0.0.1:3000`.
- `setWebsiteOrigin()` stores origin without trailing slash.
- `getOfficialModels()` returns fallback models when no origin is configured.
- With mocked fetch, `refreshModels()` reads `/api/desktop/ai/models` and caches all models.
- `createProviderSettingsService()` lists an `official` connection with `managed: true`, `enabled: true`, and all official models enabled.
- `updateConnection('official', ...)`, `deleteConnection('official')`, and changing official enabled models throw stable read-only errors.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd sidecar
bun test src/services/officialService.test.ts src/services/providerSettings.test.ts
```

Expected: FAIL because official service and official provider behavior are not implemented.

- [ ] **Step 3: Implement sidecar official service and settings**

Implementation rules:
- Export `OFFICIAL_PROVIDER_ID = 'official'`.
- Add `managed: boolean` to connection summary, resolved connection, and enabled model option types.
- Inject official model catalog through provider settings service constructor or a small dependency object.
- Official connection must never be persisted into user provider state.
- Official connection must always appear first in `listConnections()`.
- Official models are all enabled; user cannot disable individual official models.
- Route `POST /settings/official-service` accepts `{ websiteOrigin }`, validates http/https, stores in memory, and returns current official service summary.
- Existing custom provider tests must keep passing.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd sidecar
bun test \
  src/services/officialService.test.ts \
  src/services/providerSettings.test.ts \
  src/routes/settings.test.ts \
  src/routes/models.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit sidecar settings**

```bash
git add sidecar/src/services sidecar/src/routes/settings.ts sidecar/src/routes/settings.test.ts sidecar/src/routes/models.ts
git commit -m "feat: add official provider settings"
```

---

## Task 4: Sidecar official AGUI provider and run context

**Files:**
- Create: `sidecar/src/agui/provider-official/official-provider.test.ts`
- Create: `sidecar/src/agui/provider-official/official-provider.ts`
- Modify: `sidecar/src/agui/core/provider-types.ts`
- Modify: `sidecar/src/routes/runs.ts`
- Modify: `sidecar/src/agent/runWorker.ts`
- Modify: `sidecar/src/server.ts`

- [ ] **Step 1: Write failing official provider tests**

Tests must assert:
- Text deltas from NDJSON produce `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, and `RUN_FINISHED`.
- `usage` line calls usage callback or emits existing usage path used by providers.
- `billing` line is accepted without creating chat text.
- `error` line with `code: 'insufficient_credits'` produces `RUN_ERROR` with `code: 'INSUFFICIENT_CREDITS'`.
- Missing `officialAuthToken` or `officialWebsiteOrigin` produces `RUN_ERROR` without fetching.
- Abort signal cancels fetch and does not emit `RUN_FINISHED`.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd sidecar
bun test src/agui/provider-official/official-provider.test.ts
```

Expected: FAIL because official provider does not exist.

- [ ] **Step 3: Implement official provider and run wiring**

Implementation rules:
- `RunContext` adds optional `officialAuthToken?: string` and `officialWebsiteOrigin?: string`.
- `POST /runs` request schema accepts these fields but only uses them for `official`.
- `runWorker` passes both fields unchanged into provider context.
- `server.ts` builds official provider when resolved provider id is `official`; custom provider path is unchanged.
- Official provider posts:

```json
{
  "runId": "<run id>",
  "threadId": "<thread id>",
  "model": "<model id>",
  "messages": [...]
}
```

- Official provider sends header `Authorization: Bearer <officialAuthToken>`.
- It parses `application/x-ndjson` lines and maps codes:
  - `insufficient_credits` -> `INSUFFICIENT_CREDITS`
  - other upstream/config errors -> normal `RUN_ERROR`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
cd sidecar
bun test \
  src/agui/provider-official/official-provider.test.ts \
  src/routes/runs.test.ts \
  src/services/providerSettings.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit official run provider**

```bash
git add sidecar/src/agui sidecar/src/agent/runWorker.ts sidecar/src/routes/runs.ts sidecar/src/server.ts
git commit -m "feat: route official ai runs through website"
```

---

## Task 5: 桌面前端官方发送链路、积分刷新与不足提示

**Files:**
- Modify: `src/features/auth/desktop-auth-client.ts`
- Modify: `src/features/auth/AuthProvider.tsx`
- Modify: `src/lib/agui/runtime/api.ts`
- Modify: `src/lib/agui/runtime/runtime.ts`
- Modify: `src/lib/agui/react/useChat.ts`
- Modify: `src/features/task/TaskView.tsx`
- Modify: `src/features/new-task/NewTaskView.tsx`
- Modify: `src/features/task/ChatStream.tsx`
- Modify: `src/features/task/ProviderModelPicker.tsx`
- Modify: `src/features/settings/*provider*`
- Modify: `src/i18n/locales/zh/task.json`
- Modify: `src/i18n/locales/en/task.json`

- [ ] **Step 1: Write failing frontend tests**

Tests must assert:
- `desktop-auth-client` can post `{ websiteOrigin }` to `/settings/official-service`.
- Official provider send path calls `ensureAuthenticated()`, `getValidAccessToken()`, and sends `officialAuthToken` / `officialWebsiteOrigin`.
- Custom provider send path does not call auth and does not send official token.
- `INSUFFICIENT_CREDITS` chat error renders recharge text.
- Managed provider row hides edit/delete controls.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test \
  src/features/auth/desktop-auth-client.test.ts \
  src/features/task/ProviderModelPicker.test.tsx \
  src/features/task/ChatStream.test.tsx
```

Expected: FAIL for newly added official behavior.

- [ ] **Step 3: Implement frontend behavior**

Implementation rules:
- Add `syncOfficialService()` using existing sidecar client/auth token plumbing.
- Auth provider startup effect calls `syncOfficialService(getWebsiteOrigin())` after sidecar is reachable.
- `TaskView` and `NewTaskView` derive the effective provider selection; if `providerId === 'official'`, require auth before creating a run.
- Official run request includes `officialAuthToken` and `officialWebsiteOrigin`.
- On official `RUN_FINISHED` and official `RUN_ERROR` with `INSUFFICIENT_CREDITS`, call `auth.refreshUser()`.
- `ChatStream` renders localized insufficient-credit message and a button/link to website billing/credits page.
- Settings/provider UI treats `managed` connections as locked and hides edit/delete/disable actions.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test \
  src/features/auth/desktop-auth-client.test.ts \
  src/features/task/ProviderModelPicker.test.tsx \
  src/features/task/ChatStream.test.tsx
```

Expected: all tests pass. Existing React `act(...)` warnings may appear as baseline noise; do not introduce new failures.

- [ ] **Step 5: Commit frontend integration**

```bash
git add src/features src/lib/agui src/i18n
git commit -m "feat: connect official provider to desktop credits"
```

---

## Task 6: Final verification

**Files:**
- All files changed by Tasks 1-5.

- [ ] **Step 1: Run website focused verification**

Run:

```bash
bun test \
  src/shared/services/official-ai-proxy.test.ts \
  src/app/api/desktop/ai/models/route.test.ts \
  src/app/api/desktop/ai/chat/route.test.ts \
  src/shared/models/credit.test.ts \
  src/shared/lib/desktop-api.test.ts \
  src/shared/services/desktop-oauth.test.ts \
  src/app/api/desktop/oauth/token/route.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run desktop sidecar verification**

Run:

```bash
cd sidecar
bun test \
  src/services/officialService.test.ts \
  src/services/providerSettings.test.ts \
  src/routes/settings.test.ts \
  src/routes/models.test.ts \
  src/agui/provider-official/official-provider.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run desktop frontend verification**

Run:

```bash
bun test \
  src/features/auth/desktop-auth-client.test.ts \
  src/features/task/ProviderModelPicker.test.tsx \
  src/features/task/ChatStream.test.tsx
```

Expected: all tests pass; pre-existing React `act(...)` warnings are acceptable only if unchanged from baseline.

- [ ] **Step 4: Run TypeScript checks**

Run:

```bash
bunx tsc --noEmit -p tsconfig.app.json
cd sidecar && bunx tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 5: Review git diffs**

Run in both worktrees:

```bash
git status --short
git log --oneline --max-count=5
```

Expected: only intended changes are present; commits are on `feature/official-ai-credits`.

---

## Self-Review

- Spec coverage: 官网代理 env、模型列表、聊天扣费、只扣官方 provider、官网后台流水、积分不足提示、custom provider 不扣费均映射到 Task 1-5。
- Placeholder scan: 计划没有未定占位内容或未定路径；每个任务包含测试、实现、验证、提交步骤。
- Type consistency: `official`、`managed`、`officialAuthToken`、`officialWebsiteOrigin`、`INSUFFICIENT_CREDITS`、`desktop_ai_chat` 在任务中使用一致。
- Scope check: 不新增数据库表，不暴露代理密钥，不改变 custom provider 计费路径。
