import { describe, expect, it } from "bun:test";
import {
  buildCcrRunnerProcessArgv,
  isCcrRunnerMode,
  parseCcrRunnerArgs,
} from "./runner-mode";

describe("CCR runner mode", () => {
  it("detects runner mode", () => {
    expect(isCcrRunnerMode(["--ccr-runner", "--config-dir", "/tmp/ccr"])).toBe(
      true,
    );
    expect(isCcrRunnerMode(["--port=1234"])).toBe(false);
  });

  it("parses runner args", () => {
    expect(
      parseCcrRunnerArgs([
        "--ccr-runner",
        "--config-dir",
        "/tmp/ccr",
        "--cli",
        "/tmp/ccr/runtime/ccr-cli.js",
      ]),
    ).toEqual({
      configDir: "/tmp/ccr",
      cliPath: "/tmp/ccr/runtime/ccr-cli.js",
      port: undefined,
    });
  });

  it("parses optional port forwarded by the parent sidecar", () => {
    expect(
      parseCcrRunnerArgs([
        "--ccr-runner",
        "--config-dir",
        "/tmp/ccr",
        "--cli",
        "/tmp/ccr/runtime/ccr-cli.js",
        "--port",
        "4567",
      ]),
    ).toEqual({
      configDir: "/tmp/ccr",
      cliPath: "/tmp/ccr/runtime/ccr-cli.js",
      port: 4567,
    });
  });

  it("builds CCR CLI argv for start mode", () => {
    expect(buildCcrRunnerProcessArgv("/tmp/ccr/runtime/ccr-cli.js")).toEqual([
      process.argv[0] ?? "agent-studio-sidecar",
      "/tmp/ccr/runtime/ccr-cli.js",
      "start",
    ]);
  });
});
