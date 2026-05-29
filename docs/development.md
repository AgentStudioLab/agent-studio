# 开发环境指南

> 上次更新：2026-05-25

## 已配置环境

当前机器已完成以下初始化：

- 根目录依赖：`bun install`
- sidecar 依赖：`cd sidecar && bun install`
- Rust 工具链：`rustc 1.95.0`、`cargo 1.95.0`

如果新终端里找不到 `cargo` 或 `rustc`，先执行：

```bash
. "$HOME/.cargo/env"
```

`bun run tauri:*` 会直接调用 Tauri CLI。运行这些命令前，当前 shell 需要能找到 `cargo` 和 `rustc`。

## 工具链要求

| 工具 | 用途 |
| --- | --- |
| Bun | 前端依赖安装、Vite 脚本、sidecar 开发/编译 |
| Rust/Cargo | Tauri v2 桌面壳构建与检查 |
| Tauri CLI | 通过根目录 devDependency 提供，使用 `bun run tauri ...` 调用 |

不要把这个仓库改成 workspace。根项目和 `sidecar/` 是独立 package，升级依赖时分别处理 lockfile。

## 安装依赖

```bash
bun install
cd sidecar && bun install
```

建议每次拉取新代码后先在根目录执行：

```bash
bun install --frozen-lockfile
cd sidecar && bun install --frozen-lockfile
```

## 开发模式

### 纯前端

```bash
bun run dev
```

适合调 UI、storybook 组件和不依赖真实 sidecar 的页面。

### 浏览器前端 + sidecar

开启两个终端：

```bash
bun run dev:server
```

```bash
bun run dev
```

浏览器模式下前端会连接固定开发 sidecar：

- URL：`http://127.0.0.1:4123`
- Authorization：`Bearer dev-token`
- DB：`sidecar/dev.db`

### 完整桌面应用

```bash
. "$HOME/.cargo/env"
bun run tauri:dev
```

`tauri:dev` 会先运行 `build:sidecar -- --host-only`，确保 Tauri 能找到当前平台对应的 sidecar 二进制。

## 构建与检查

```bash
bun run build
bun run build:sidecar -- --host-only
cargo check --manifest-path src-tauri/Cargo.toml
```

发布构建：

```bash
bun run tauri:build
```

注意：项目当前只配置 macOS arm64、macOS x64、Windows x64 sidecar 目标，没有 Linux 目标。

## 数据与本地文件

- 开发 sidecar 默认数据库：`sidecar/dev.db`
- sidecar 启动时会创建 `~/.agent-studio/workspace` 和 `~/.agent-studio/skills`
- 打包的 sidecar 二进制输出到 `src-tauri/binaries/`，该目录产物不提交

## 常见问题

### `cargo: command not found`

执行：

```bash
. "$HOME/.cargo/env"
```

如果仍不可用，重新安装 Rust：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

### 浏览器页面请求 sidecar 失败

确认 `bun run dev:server` 正在运行，并且启动参数包含：

```text
--port=4123 --token=dev-token --db=sidecar/dev.db
```

### 不要直接运行 `tauri dev`

直接运行原生命令不会先编译 host sidecar。使用：

```bash
bun run tauri:dev
```

### 修改 Tauri 插件版本后运行异常

Rust crate 和 npm package 的 Tauri 插件版本需要保持 major/minor 一致，尤其是：

- `tauri-plugin-shell` 与 `@tauri-apps/plugin-shell`
- `tauri-plugin-store` 与 `@tauri-apps/plugin-store`
