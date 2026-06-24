import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface AudioToolStatus {
  ffmpeg: "ready" | "missing";
  whisper: "ready" | "missing" | "unconfigured";
  whisperx: "ready" | "missing" | "unconfigured";
  chattts: "ready" | "unconfigured" | "unsupported";
  fishSpeech: "ready" | "unconfigured" | "unsupported";
}

interface DetectOptions {
  pathEnv?: string;
  executableNames?: string[];
  exists?: (path: string) => boolean;
}

function hasCommand(name: string, opts: DetectOptions): boolean {
  if (opts.executableNames?.includes(name)) return true;
  const exists = opts.exists ?? existsSync;
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? "";
  return pathEnv.split(delimiter).some((dir) => dir.length > 0 && exists(join(dir, name)));
}

/** 只读工具体检：检查本机是否能找到常见音频命令，不运行模型、不下载依赖、不写文件。 */
export function detectAudioToolStatus(opts: DetectOptions = {}): AudioToolStatus {
  return {
    ffmpeg: hasCommand("ffmpeg", opts) ? "ready" : "missing",
    whisper: hasCommand("whisper", opts) || hasCommand("whisper.cpp", opts) ? "ready" : "missing",
    whisperx: hasCommand("whisperx", opts) ? "ready" : "missing",
    chattts: hasCommand("chattts", opts) ? "ready" : "unconfigured",
    fishSpeech: hasCommand("fish-speech", opts) ? "ready" : "unconfigured",
  };
}
