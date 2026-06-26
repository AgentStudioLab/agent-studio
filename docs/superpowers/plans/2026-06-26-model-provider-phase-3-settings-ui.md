# Phase 3: 模型设置页信息架构改造

**Status:** not started

**Goal:** 把当前“连接列表 + 大弹窗”的模型设置页改成左侧连接列表、右侧连接详情，并从普通 UI 隐藏 CCR 概念。

**Depends on:** Phase 1, Phase 2。

## 范围

- 双栏设置页。
- 完整上游请求地址展示。
- 健康检查 UI。
- 模型列表能力标签。
- 默认模型设置落到具体模型行。
- 普通 UI 移除 CCR 状态。

## 涉及文件

- `src/features/settings/sections/ModelSection.tsx`
- `src/features/settings/sections/ProviderConnectionSidebar.tsx`
- `src/features/settings/sections/ProviderConnectionDetail.tsx`
- `src/features/settings/sections/ProviderEndpointPreview.tsx`
- `src/features/settings/sections/ProviderHealthPanel.tsx`
- `src/features/settings/sections/ProviderModelCapabilityBadges.tsx`
- `src/features/settings/sections/ProviderModelSelector.tsx`
- `src/i18n/locales/zh/settings.json`
- `src/i18n/locales/en/settings.json`
- `src/features/settings/sections/ModelSection.test.tsx`
- `src/features/settings/sections/modelSectionModels.test.ts`

## 任务清单

- [ ] `ModelSection` 改为左右布局。
- [ ] 左侧连接列表显示名称、供应商、健康状态、默认模型摘要。
- [ ] 右侧连接详情显示基础配置。
- [ ] 自定义 Provider 协议选择显示三个选项：OpenAI Chat Completions / OpenAI Responses / Anthropic Messages。
- [ ] 显示完整上游请求地址，不显示 CCR 本地地址。
- [ ] 移除普通 UI 的 `CcrRuntimeStatus`。
- [ ] CCR 错误映射成用户语义：模型路由初始化失败。
- [ ] 健康检查按钮调用 Phase 2 API。
- [ ] 模型行展示能力 badge。
- [ ] 模型行支持启用/停用。
- [ ] 默认模型设置改到模型行。
- [ ] “允许用于对话”改成“启用连接”或“启用模型”。
- [ ] 模型能力详情支持手动覆盖。

## 关键测试

```bash
bun test src/features/settings/sections/ModelSection.test.tsx \
  src/features/settings/sections/modelSectionModels.test.ts

bunx tsc --noEmit -p tsconfig.app.json
```

## 验收

- 设置页普通界面不出现 CCR 字样。
- 用户能看到最终上游请求地址。
- 用户能选择 OpenAI Responses 并看到 `/responses`。
- 默认模型不再作为连接卡片动作出现。
- 能力标签显示 verified/manual/unknown/unsupported 语义。
