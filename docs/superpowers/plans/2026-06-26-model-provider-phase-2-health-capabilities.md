# Phase 2: Provider 健康检查与模型能力数据

**Status:** not started

**Goal:** 让用户能测试 Provider 连接，并让系统记录模型能力标签，为设置页重构和视觉输入做准备。

**Depends on:** Phase 1。

## 范围

- 新增基础连接测试 API。
- 保存最近健康检查结果。
- 建立模型能力数据结构。
- 支持系统探测结果和用户手动覆盖。

## 涉及文件

- `sidecar/src/services/providerSettings.ts`
- `sidecar/src/services/providerHealth.ts`
- `sidecar/src/services/modelCapabilities.ts`
- `sidecar/src/routes/settings.ts`
- `src/lib/data/settings.ts`
- `sidecar/src/services/providerSettings.test.ts`
- `sidecar/src/routes/settings-provider.test.ts`

## 任务清单

- [ ] 定义连接健康状态：`ok | auth_error | network_error | protocol_error | model_error`。
- [ ] Provider connection 保存 `health` 字段。
- [ ] 新增 `POST /settings/provider/connections/:id/test`。
- [ ] Chat Completions 健康检查调用最终 `/chat/completions`。
- [ ] Responses 健康检查调用最终 `/responses`。
- [ ] Anthropic 健康检查调用 Messages endpoint。
- [ ] 健康检查返回最终上游请求地址。
- [ ] 定义模型能力 key：`text | tools | vision | reasoning | structuredOutput`。
- [ ] 定义能力来源：`verified | provider | manual | unsupported | unknown`。
- [ ] Provider connection 保存每个模型的能力状态。
- [ ] 用户手动覆盖优先于后续探测结果。
- [ ] 增加“恢复自动”数据语义，但 UI 可在 Phase 3 实现。

## 关键测试

```bash
bun test sidecar/src/services/providerSettings.test.ts \
  sidecar/src/routes/settings-provider.test.ts

cd sidecar && bunx tsc --noEmit
```

## 验收

- 测试连接能返回健康状态、错误类型、延迟和最终请求地址。
- 能力探测结果能持久化。
- 用户手动标记不会被后台探测静默覆盖。
- 不要求用户手动填写所有能力。
