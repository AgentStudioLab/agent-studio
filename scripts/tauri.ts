#!/usr/bin/env bun
import { delimiter, join } from "node:path";

const cargoHome =
  process.env.CARGO_HOME ??
  (process.env.HOME
    ? join(process.env.HOME, ".cargo")
    : process.env.USERPROFILE
      ? join(process.env.USERPROFILE, ".cargo")
      : undefined);

const cargoBin = cargoHome ? join(cargoHome, "bin") : undefined;
const path = [cargoBin, process.env.PATH].filter(Boolean).join(delimiter);

const proc = Bun.spawn(["tauri", ...process.argv.slice(2)], {
  env: { ...process.env, PATH: path },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await proc.exited);
