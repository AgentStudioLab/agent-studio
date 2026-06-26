# Phase 4: 图片附件存储与上传 API

**Status:** not started

**Goal:** 为图片上传和截图粘贴建立稳定本地附件存储，不依赖原始文件路径。

**Depends on:** 可与 Phase 1/2/3 并行，但被 Phase 5 依赖。

## 范围

- 新增附件表。
- 图片文件复制到应用数据目录。
- 上传图片 API。
- 附件元数据查询与缩略图/原图读取。

## 涉及文件

- `sidecar/src/db.ts`
- `sidecar/src/services/attachments.ts`
- `sidecar/src/routes/attachments.ts`
- `sidecar/src/server.ts`
- `src/lib/data/attachments.ts`
- `sidecar/src/services/attachments.test.ts`
- `sidecar/src/routes/attachments.test.ts`
- `sidecar/src/db.test.ts`

## 任务清单

- [ ] 新增 `attachments` 表。
- [ ] 新增 `message_attachments` 关系表。
- [ ] `AttachmentService` 支持创建 image attachment。
- [ ] 存储路径使用 `attachments/<threadId>/<sha256>.<ext>`。
- [ ] 计算 `sha256`、`byteSize`、`mimeType`、`filename`。
- [ ] 尽量解析图片 `width/height`。
- [ ] 新增 `POST /attachments/images`。
- [ ] 限制 mime：PNG/JPEG/WebP。
- [ ] 限制单图大小，建议 10MB。
- [ ] 前端 `uploadImageAttachment` client。

## 关键测试

```bash
bun test sidecar/src/services/attachments.test.ts \
  sidecar/src/routes/attachments.test.ts \
  sidecar/src/db.test.ts

cd sidecar && bunx tsc --noEmit
```

## 验收

- 剪贴板图片和文件图片都能以字节形式保存。
- 附件不引用原始路径。
- 删除 conversation 时附件记录随 thread 清理。
- API 返回稳定 attachment id 和元数据。
