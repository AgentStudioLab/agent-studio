# Phase 1: OpenAI Responses 思考链路修复

**Status:** completed

**Goal:** 修复最早发现的问题：同一个 OpenAI 模型经 Chat Completions 看不到思考内容，而经 Responses 可以看到 reasoning summary。

**Depends on:** Spec 已确认。

## 范围

- 拆分 Provider 协议：OpenAI Chat Completions / OpenAI Responses / Anthropic Messages。
- CCR config 根据协议生成不同上游 endpoint 和 transformer。
- SDK provider 支持透传 `thinking`。
- OpenAI Responses 路径启用 summarized thinking。
- 不做旧 `openai-compatible` 配置迁移。

## 涉及文件

- `sidecar/src/services/providerSettings.ts`
- `src/lib/data/settings.ts`
- `sidecar/src/ccr/routes.ts`
- `sidecar/src/ccr/config.ts`
- `sidecar/src/server.ts`
- `sidecar/src/agui/provider-claude/provider.ts`
- `sidecar/src/services/providerSettings.test.ts`
- `sidecar/src/ccr/config.test.ts`
- `sidecar/src/ccr/routes.test.ts`
- `sidecar/src/ccr/runtime-service.test.ts`
- `sidecar/src/agui/provider-claude/provider.test.ts`

## 任务清单

- [x] 更新后端 `CustomProviderProtocol` 为 `openai-chat-completions | openai-responses | anthropic`。
- [x] 更新前端 `CustomProviderProtocol` 类型。
- [x] 删除或改写旧 `openai-compatible` 测试，不做迁移兼容。
- [x] `resolveCcrRuntimeRoute` 携带上游协议。
- [x] `buildAgentStudioCcrConfig` 对 Chat Completions 生成 `/chat/completions`。
- [x] `buildAgentStudioCcrConfig` 对 Responses 生成 `/responses` + `openai-responses` transformer。
- [x] Chat Completions 路径增加 `reasoning` transformer，用于兼容 `reasoning_content`。
- [x] 增加 CCR runtime asset 测试，确保 bundled runtime 包含 `openai-responses` transformer。
- [x] `ClaudeProviderOptions` 增加 `thinking`。
- [x] `createClaudeProvider` 把 `thinking` 传入 `sdkQuery({ options })`。
- [x] `server.ts` 仅对 OpenAI Responses 的 CCR provider 传 `thinking: { type: "adaptive", display: "summarized" }`。

## 关键测试

```bash
bun test sidecar/src/services/providerSettings.test.ts \
  sidecar/src/ccr/config.test.ts \
  sidecar/src/ccr/routes.test.ts \
  sidecar/src/ccr/runtime-service.test.ts \
  sidecar/src/agui/provider-claude/provider.test.ts

cd sidecar && bunx tsc --noEmit
```

## 验收

- OpenAI Responses Provider 的 CCR config 使用 `/responses` 和 `openai-responses`。
- OpenAI Chat Completions Provider 仍使用 `/chat/completions`。
- Responses 路径 SDK 请求包含 summarized thinking。
- 不能出现基于模型 ID 的 Responses 判断逻辑。

## 手动验证

- 配置 `https://aiproxy.cloud-ip.cc/v1` + `gpt-5.5` + OpenAI Responses。
- 发起普通对话，确认 UI 显示 reasoning/thinking 内容。
- 切回 OpenAI Chat Completions，确认不会强制走 `/responses`。

## 完成记录

- 2026-06-26: 已完成协议拆分、CCR Responses 路由、Chat Completions reasoning transformer、SDK thinking 透传和最小 UI 协议选项。
- 自动验证已通过 focused tests、相邻 settings/UI tests、前端 tsc、sidecar tsc。
