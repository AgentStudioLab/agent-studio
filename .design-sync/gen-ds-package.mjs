// 生成合成的「设计系统包」，供 design-sync 转换器消费。
//
// 背景：本仓库是 Tauri 应用，不是发布的组件库——没有把组件挂到
// window.<Global> 的 dist barrel，也没有 .d.ts 导出面。storybook-shape 转换器
// 需要两样东西：
//   1) 一个 --entry（barrel），把所有「有 story 的组件」聚合成一个 IIFE 入口，
//      bundle 后即 window.AgentStudio.*；
//   2) 一个 .d.ts，声明这些导出名，让 exportedNames() 能识别（否则所有组件会被
//      [TITLE_UNMAPPED] 丢弃）。
//
// 本脚本扫描 sb-reference/index.json 列出的每个 story 文件，提取其 `@/` 导入，
// 解析这些源模块的「值导出名」，去重后生成：
//   .design-sync/ds-package/{package.json, entry.tsx, entry.d.ts}
//
// 确定性：同样的仓库 + 同样的 stories → 生成同样的字节，re-sync 可重复执行。
//
// 用法（从仓库根运行，需要 .ds-sync/node_modules 里的 esbuild）：
//   NODE_PATH="$(pwd)/.ds-sync/node_modules" node .design-sync/gen-ds-package.mjs

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO, 'src');
const OUT_DIR = join(REPO, '.design-sync', 'ds-package');
const SB_INDEX = join(REPO, '.design-sync', 'sb-reference', 'index.json');

// esbuild 从 .ds-sync/node_modules 解析（转换器的依赖目录，不污染仓库 lockfile）。
const requireFromDsSync = createRequire(join(REPO, '.ds-sync', 'package.json'));
const esbuild = requireFromDsSync('esbuild');

// 这些 `@/` 子目录里的模块需要被 story-imports 改写到 global（保证 provider 与
// 组件共享同一份 React context）。因此 barrel 必须导出它们的全部值导出名。
// lib / styles 等纯工具目录不在此列：它们在预览里从源码 bundle，无 context 依赖。
const SHIMMED_DIRS = ['app/', 'features/', 'components/', 'shared/'];
const inShimmedDir = (specTail) => SHIMMED_DIRS.some((d) => specTail.startsWith(d));

// 把 `@/x/y` 解析成磁盘上的源文件。
function resolveAlias(spec) {
  const tail = spec.slice(2); // 去掉 '@/'
  const base = join(SRC, tail);
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(join(base, 'index' + ext))) return join(base, 'index' + ext);
  }
  return null;
}

// 用 esbuild 解析单文件的「值导出名」（bundle:false，类型导出会被擦除，
// 因此只剩运行时存在的导出）。约 10ms/文件。
async function valueExportsOf(absPath) {
  try {
    const r = await esbuild.build({
      entryPoints: [absPath], bundle: false, write: false, metafile: true,
      format: 'esm', platform: 'neutral', logLevel: 'silent', jsx: 'preserve',
      loader: { '.js': 'jsx' },
    });
    const out = Object.values(r.metafile.outputs)[0];
    return (out?.exports ?? []).filter((e) => e !== 'default');
  } catch (e) {
    console.error(`  ! 解析导出失败 ${absPath}: ${String(e?.errors?.[0]?.text ?? e?.message ?? e).split('\n')[0]}`);
    return [];
  }
}

// 把磁盘上的源文件路径折算回 `@/` 形式说明符（barrel 统一用 `@/` 导入，
// 由 tsconfig-paths 解析）。不在 src 下则返回 null。
function toAliasSpec(absFile) {
  const rel = absFile.startsWith(SRC + '/') ? absFile.slice(SRC.length + 1) : null;
  if (!rel) return null;
  return '@/' + rel.replace(/\.[cm]?[jt]sx?$/, '');
}

// 从一个 story 文件源码里提取它直接导入的「组件源模块」说明符，统一成 `@/` 形式。
// 同时覆盖两种写法：`@/...` 别名导入，以及相对路径导入（如 ask-user story 用
// `./AskUserCard`）。import-type 不在此区分——下游用「值导出」过滤即可。
function extractSpecs(srcText, storyFile) {
  const specs = new Set();
  const re = /(?:from|import)\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(srcText))) {
    const raw = m[1];
    if (raw.startsWith('@/')) {
      specs.add(raw);
    } else if (raw.startsWith('./') || raw.startsWith('../')) {
      const abs = resolveRelative(storyFile, raw);
      const alias = abs && toAliasSpec(abs);
      if (alias) specs.add(alias);
    }
  }
  return specs;
}

// 解析相对导入到磁盘源文件（相对 story 文件所在目录）。
function resolveRelative(fromFile, rel) {
  const base = resolve(dirname(fromFile), rel);
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
    if (existsSync(join(base, 'index' + ext))) return join(base, 'index' + ext);
  }
  return existsSync(base) ? base : null;
}

async function main() {
  if (!existsSync(SB_INDEX)) {
    console.error(`找不到 ${SB_INDEX} — 先构建 sb-reference（§2.2）。`);
    process.exit(1);
  }
  const idx = JSON.parse(readFileSync(SB_INDEX, 'utf8'));
  const entries = Object.values(idx.entries ?? {}).filter((e) => e.type !== 'docs');

  // 1) 收集所有 story 文件 → 提取它们的 `@/` 导入说明符。
  const storyFiles = [...new Set(entries.map((e) => e.importPath).filter(Boolean))]
    .map((ip) => resolve(REPO, ip))
    .filter(existsSync);
  const allSpecs = new Set();
  for (const f of storyFiles) {
    for (const s of extractSpecs(readFileSync(f, 'utf8'), f)) allSpecs.add(s);
  }

  // 2) 只保留落在「需要 shim 的子目录」里的说明符，并解析到源文件。
  const specToFile = new Map();
  for (const spec of [...allSpecs].sort()) {
    if (!inShimmedDir(spec.slice(2))) continue; // 跳过 lib/ styles/ 等纯工具
    const abs = resolveAlias(spec);
    if (!abs) { console.error(`  ! 无法解析说明符 ${spec}`); continue; }
    specToFile.set(spec, abs);
  }

  // 3) 解析每个源模块的值导出名；去重（先到先得），生成 barrel 重导出行。
  // 预先占用 provider 块里手写导出的名字，避免重复导出。这些是 cfg.provider 复刻
  // App.tsx 根 provider 栈所需的导出（Router/Auth/AppShell/MessageQueue/Tooltip）。
  const PROVIDER_EXPORTS = [
    'QueryClientProvider', 'MemoryRouter', 'TooltipProvider',
    'AuthProvider', 'MessageQueueProvider', 'dsQueryClient',
  ];
  const seen = new Set(PROVIDER_EXPORTS);
  const reexportLines = [];
  // AppShellProvider 由自动重导出块覆盖（来自 @/app/AppShellContext）；其余 provider
  // 在 .d.ts 里显式声明，供 exportedNames() 的 PROVIDER 门校验。
  const dtsNames = new Set([
    'QueryClientProvider', 'MemoryRouter', 'TooltipProvider',
    'AuthProvider', 'MessageQueueProvider',
  ]);
  for (const [spec, abs] of specToFile) {
    const names = (await valueExportsOf(abs)).filter((n) => !seen.has(n));
    if (!names.length) continue;
    for (const n of names) {
      seen.add(n);
      if (/^[A-Z][A-Za-z0-9]*$/.test(n)) dtsNames.add(n); // 只有 PascalCase 进 .d.ts
    }
    reexportLines.push(`export { ${names.join(', ')} } from ${JSON.stringify(spec)};`);
  }

  // 4) 覆盖性校验：每个 story title 的「组件名」（末段）都应在导出集合里，
  // 否则该组件会被转换器过滤成 floor card。
  const squash = (s) => s.replace(/\s+/g, '');
  const titleComp = new Set(
    entries.map((e) => squash(String(e.title).split('/').pop())).filter(Boolean),
  );
  const missing = [...titleComp].filter((n) => !seen.has(n)).sort();

  // 5) 写出 barrel。
  const entryTsx = `/* 由 .design-sync/gen-ds-package.mjs 自动生成——请勿手改。
 * 合成的设计系统 barrel：把所有有 story 的组件聚合到一个入口，
 * design-sync 会将其 bundle 成 window.AgentStudio.*。 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { MessageQueueProvider } from "@/features/task/MessageQueueContext";
import { defaultThemeId } from "@/styles/themes/registry";

// 复刻 App.tsx 的根 provider 栈，用 bundle 自身的实例，保证预览里的 provider 与
// 组件共享同一份 React context。cfg.provider 会按
// QueryClient > MemoryRouter > Auth > AppShell > MessageQueue > Tooltip 嵌套，
// 让依赖 useLocation/useAuth/useAppShell 的视图组件能正常渲染。
// AppShellProvider 由下方自动重导出块导出（来自 @/app/AppShellContext）。
export { QueryClientProvider, MemoryRouter, TooltipProvider, AuthProvider, MessageQueueProvider };
export const dsQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

// 复刻 preview.tsx：storybook/预览各有自己的 <html>，需在 bundle 载入时种下
// data-brand，否则品牌/强调色不生效。
if (typeof document !== "undefined") {
  try {
    document.documentElement.setAttribute("data-brand", defaultThemeId());
  } catch {}
}

// ↓ 各组件按源模块重新导出（去重）。
${reexportLines.join('\n')}
`;

  // 6) 写出 .d.ts（any 类型；exportedNames 只看 PascalCase 值导出名）。
  const dtsBody = [...dtsNames].sort()
    .map((n) => `export declare const ${n}: any;`)
    .join('\n');
  const entryDts = `/* 由 gen-ds-package.mjs 自动生成。声明 barrel 的值导出名，
 * 供 design-sync 的 exportedNames() 识别。any 类型——后续 sync 可改为
 * 真实 prop 类型（tsc --emitDeclarationOnly / react-docgen）。 */
${dtsBody}
`;

  const pkgJson = {
    name: 'agent-studio-ds',
    version: '0.1.0',
    private: true,
    module: './entry.tsx',
    types: './entry.d.ts',
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'entry.tsx'), entryTsx);
  writeFileSync(join(OUT_DIR, 'entry.d.ts'), entryDts);
  writeFileSync(join(OUT_DIR, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');

  console.error(`✓ ds-package 生成完成 → ${OUT_DIR}`);
  console.error(`  story 文件: ${storyFiles.length}`);
  console.error(`  shim 子目录里的说明符: ${specToFile.size}`);
  console.error(`  barrel 重导出行: ${reexportLines.length}`);
  console.error(`  导出值名总数: ${seen.size}（PascalCase 进 .d.ts: ${dtsNames.size}）`);
  console.error(`  story title 组件名: ${titleComp.size}`);
  if (missing.length) {
    console.error(`  ! 警告：${missing.length} 个 title 组件名不在导出集合（会变 floor card）：`);
    console.error(`    ${missing.join(', ')}`);
  } else {
    console.error(`  ✓ 全部 story title 组件名都已覆盖`);
  }
}

main();
