# Phase 6: Provider 多模态发送与非视觉附件说明

**Status:** not started

**Goal:** 将图片附件正确送入模型运行：视觉模型收到 image block，非视觉模型收到附件路径说明并可通过工具处理。

**Depends on:** Phase 2, Phase 4, Phase 5。

## 范围

- Provider run context 支持附件。
- 根据模型能力决定视觉输入方式。
- Claude Agent SDK prompt 支持 image block。
- 非视觉模型注入附件路径说明。
- 附件目录加入可读范围。

## 涉及文件

- `sidecar/src/agui/core/provider-types.ts`
- `sidecar/src/agent/runWorker.ts`
- `sidecar/src/agui/provider-claude/provider.ts`
- `sidecar/src/agui/provider-claude/sandbox.ts`
- `sidecar/src/agui/provider-claude/provider.test.ts`
- `sidecar/src/agent/runWorker.test.ts`
- `sidecar/src/agui/provider-claude/sandbox.test.ts`

## 任务清单

- [ ] 定义 `RunUserImageAttachment`。
- [ ] `RunContext.userMessage` 支持附件。
- [ ] `runWorker` 根据 attachment ids 加载附件元数据。
- [ ] `runWorker` 根据模型能力设置 `visualInputEnabled`。
- [ ] 视觉模型读取图片 bytes 并转换 base64 image block。
- [ ] 非视觉模型构造附件说明文本。
- [ ] 对所有带附件 run，把附件存储目录加入 provider 可读范围。
- [ ] 确认 regenerate/resume 能重用原始附件。
- [ ] 官方 website runtime 暂不支持图片时，返回明确能力限制或走非视觉附件说明。

## 非视觉说明格式

```text
Attached images:
- screenshot.png (image/png, 1280x720): /absolute/path/to/attachments/thread_xxx/hash.png

These images are not embedded as visual input for the current model. Use available tools to inspect them if needed.
```

## 关键测试

```bash
bun test sidecar/src/agui/provider-claude/provider.test.ts \
  sidecar/src/agent/runWorker.test.ts \
  sidecar/src/agui/provider-claude/sandbox.test.ts

cd sidecar && bunx tsc --noEmit
```

## 验收

- 支持视觉的模型请求包含 image block。
- 不支持视觉的模型请求不包含 image block，但包含附件路径说明。
- Agent 可通过工具读取附件路径。
- regenerate 不丢失图片上下文。
