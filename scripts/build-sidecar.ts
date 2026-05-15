#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(projectRoot, "sidecar/src/server.ts");
const outDir = resolve(projectRoot, "src-tauri/binaries");
const binBase = "agent-studio-sidecar";

type Target = {
  bunTarget: string;
  tauriTriple: string;
  ext: "" | ".exe";
  hostMatch: (platform: NodeJS.Platform, arch: string) => boolean;
};

const targets: Target[] = [
  {
    bunTarget: "bun-darwin-arm64",
    tauriTriple: "aarch64-apple-darwin",
    ext: "",
    hostMatch: (p, a) => p === "darwin" && a === "arm64",
  },
  {
    bunTarget: "bun-darwin-x64",
    tauriTriple: "x86_64-apple-darwin",
    ext: "",
    hostMatch: (p, a) => p === "darwin" && a === "x64",
  },
  {
    bunTarget: "bun-windows-x64",
    tauriTriple: "x86_64-pc-windows-msvc",
    ext: ".exe",
    hostMatch: (p, a) => p === "win32" && a === "x64",
  },
];

const hostOnly = process.argv.includes("--host-only");

const selected = hostOnly
  ? targets.filter((t) => t.hostMatch(process.platform, process.arch))
  : targets;

if (selected.length === 0) {
  console.error(
    `[build-sidecar] no matching target for host ${process.platform}/${process.arch}`,
  );
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

for (const target of selected) {
  const outfile = resolve(
    outDir,
    `${binBase}-${target.tauriTriple}${target.ext}`,
  );
  console.log(`[build-sidecar] ${target.bunTarget} -> ${outfile}`);
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      entry,
      "--compile",
      "--minify",
      "--bytecode",
      `--target=${target.bunTarget}`,
      `--outfile=${outfile}`,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`[build-sidecar] failed: ${target.bunTarget} (exit ${code})`);
    process.exit(code);
  }
}

console.log(`[build-sidecar] done (${selected.length} target${selected.length > 1 ? "s" : ""})`);
