# Phase 5: 输入框图片上传、粘贴与历史展示

**Status:** not started

**Goal:** 普通对话输入框支持选择图片和截图粘贴，发送前能预览和移除，历史消息能展示缩略图。

**Depends on:** Phase 4。建议 Phase 3 后执行，避免 UI 反复改。

## 范围

- 附件按钮选择图片。
- 剪贴板截图粘贴。
- 发送前附件预览和移除。
- `runtime.send` 支持 attachment ids。
- `/runs` 支持 attachment ids。
- 历史消息展示图片。
- 不做拖拽。

## 涉及文件

- `src/features/task/TaskMessageInput.tsx`
- `src/features/task/ImageAttachmentTray.tsx`
- `src/lib/agui/runtime/api.ts`
- `src/lib/agui/runtime/runtime.ts`
- `src/lib/agui/runtime/types.ts`
- `sidecar/src/routes/runs.ts`
- `sidecar/src/services/messages.ts`
- `sidecar/src/routes/messages.ts`
- `src/features/task/ChatStream.tsx`
- `src/features/task/TaskMessageInput.test.tsx`
- `src/lib/agui/runtime/runtime.test.ts`
- `sidecar/src/routes/runs.test.ts`
- `sidecar/src/services/messages.test.ts`
- `src/features/task/ChatStream.test.tsx`

## 任务清单

- [ ] `TaskMessageInput` 增加附件按钮。
- [ ] 文件选择支持 PNG/JPEG/WebP。
- [ ] `onPaste` 读取 clipboard image。
- [ ] 调用 `uploadImageAttachment` 上传到 sidecar。
- [ ] `ImageAttachmentTray` 显示缩略图、文件名、移除按钮。
- [ ] `onSend/onQueue/onOverride` 支持 `{ attachmentIds }`。
- [ ] `runtime.send` 乐观消息保存附件信息。
- [ ] `postRun` body 增加 `attachmentIds`。
- [ ] `/runs` 校验 attachment ids。
- [ ] user message 持久化和 `message_attachments` 绑定。
- [ ] `/conversations/:id/messages` 返回用户消息附件。
- [ ] `ChatStream` 展示历史图片缩略图。

## 关键测试

```bash
bun test src/features/task/TaskMessageInput.test.tsx \
  src/lib/agui/runtime/runtime.test.ts \
  sidecar/src/routes/runs.test.ts \
  sidecar/src/services/messages.test.ts \
  src/features/task/ChatStream.test.tsx

bunx tsc --noEmit -p tsconfig.app.json
cd sidecar && bunx tsc --noEmit
```

## 验收

- 用户能上传图片文件。
- 用户能粘贴截图。
- 发送前能预览和移除图片。
- 发送后历史消息能展示图片。
- 不支持视觉的模型也不阻止图片发送。
