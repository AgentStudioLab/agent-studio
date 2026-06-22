// 分析 barrel 打包后各 node_modules 包贡献的字节数，定位 30MB 体积来源。
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(resolve(REPO, '.ds-sync', 'package.json'));
const esbuild = req('esbuild');
const { tsconfigPathsPlugin } = await import(resolve(REPO, '.ds-sync', 'lib', 'bundle.mjs'));

const r = await esbuild.build({
  entryPoints: [resolve(REPO, '.design-sync/ds-package/entry.tsx')],
  bundle: true, format: 'iife', globalName: 'AgentStudio', write: false, metafile: true,
  platform: 'browser', target: 'es2020', nodePaths: [resolve(REPO, 'node_modules')],
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-is', 'scheduler'],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [tsconfigPathsPlugin(resolve(REPO, '.design-sync/ds-package/tsconfig.bundle.json'))],
  logLevel: 'silent',
});

const byPkg = {};
for (const [p, info] of Object.entries(r.metafile.inputs)) {
  const m = p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  const key = m ? m[1] : '(src)';
  byPkg[key] = (byPkg[key] || 0) + info.bytes;
}
const sorted = Object.entries(byPkg).sort((a, b) => b[1] - a[1]);
const total = sorted.reduce((s, [, b]) => s + b, 0);
console.log(`总输入字节: ${(total / 1e6).toFixed(1)} MB（含 src）\n`);
console.log('Top 30 包贡献:');
for (const [k, b] of sorted.slice(0, 30)) {
  console.log(`  ${(b / 1e6).toFixed(2).padStart(6)} MB  ${k}`);
}
