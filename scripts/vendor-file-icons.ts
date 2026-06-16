/**
 * 把 vscode-icons-js 能返回的全部「文件类型图标」SVG 拉取到 public/file-icons/。
 *
 * 背景:`vscode-icons-js` 只提供「文件名 → 图标文件名」的映射(getIconForFile),
 * 本身不含 SVG;真正的 SVG 在 vscode-icons/vscode-icons 仓库的 icons/ 目录。
 * 本脚本从「已安装的」vscode-icons-js 内部映射表里取出所有会被 getIconForFile
 * 返回的图标名(只取文件图标表,不含文件夹图标),逐个从 jsdelivr 下载,落到
 * public/file-icons/ 并提交。这样图标随 Tauri 包离线下发,运行时只需用
 * `/file-icons/<name>` 这样的根绝对路径引用。
 *
 * 用法:`bun run scripts/vendor-file-icons.ts`
 * 想升级图标集时:bump 下面的 VSCODE_ICONS_VERSION 再跑一次即可。
 */

// vscode-icons 仓库的 tag —— 提供实际 SVG 字节。名字在各版本间稳定且只增不减,
// 因此可以用较新的稳定版来覆盖 vscode-icons-js@11.6.1 映射里的全部名字。
// 与 vscode-icons-js@11.6.1 的映射表同源(11.6.x),保证映射里的每个图标名
// 在该 tag 下都存在,运行时无需回退。升级 vscode-icons-js 时同步 bump。
const VSCODE_ICONS_VERSION = "11.6.0";

// 直接引用「已安装包」内部的生成映射表 —— 保证拉取的图标集与运行时
// getIconForFile 实际可能返回的集合完全一致(只取文件图标,不含 Folder 表)。
import { FileExtensions1ToIcon } from "vscode-icons-js/dist/generated/FileExtensions1ToIcon";
import { FileExtensions2ToIcon } from "vscode-icons-js/dist/generated/FileExtensions2ToIcon";
import { FileNamesToIcon } from "vscode-icons-js/dist/generated/FileNamesToIcon";
import { LanguagesToIcon } from "vscode-icons-js/dist/generated/LanguagesToIcon";
import { DEFAULT_FILE } from "vscode-icons-js";

import { mkdir } from "node:fs/promises";

// 汇总所有「文件图标」名字 + 兜底 default_file.svg,去重。
const names = new Set<string>([DEFAULT_FILE]);
for (const table of [
  FileExtensions1ToIcon,
  FileExtensions2ToIcon,
  FileNamesToIcon,
  LanguagesToIcon,
]) {
  for (const icon of Object.values(table)) names.add(icon);
}

const outDir = new URL("../public/file-icons/", import.meta.url);
await mkdir(outDir, { recursive: true });

const base = `https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@${VSCODE_ICONS_VERSION}/icons`;
const missing: string[] = [];
let written = 0;

// jsdelivr 对并发友好,但限速;分小批下载避免被限流。
const all = [...names].sort();
const BATCH = 16;
for (let i = 0; i < all.length; i += BATCH) {
  const batch = all.slice(i, i + BATCH);
  await Promise.all(
    batch.map(async (name) => {
      const res = await fetch(`${base}/${name}`);
      if (!res.ok) {
        missing.push(name);
        return;
      }
      const svg = await res.text();
      await Bun.write(new URL(name, outDir), svg);
      written++;
    }),
  );
  process.stdout.write(`\r下载中 ${Math.min(i + BATCH, all.length)}/${all.length}`);
}
process.stdout.write("\n");

console.log(`完成:写入 ${written} 个图标到 public/file-icons/`);
if (missing.length) {
  console.warn(
    `警告:${missing.length} 个图标在 vscode-icons@${VSCODE_ICONS_VERSION} 中缺失,` +
      `运行时会回退到 ${DEFAULT_FILE}:\n  ${missing.join(", ")}`,
  );
}
