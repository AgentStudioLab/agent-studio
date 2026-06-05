import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export type RemoteSendType = "file" | "image";
export type RemoteSendRejectReason =
  | "not_found"
  | "outside_output"
  | "not_file"
  | "too_large";

export interface RemoteSendAction {
  type: RemoteSendType;
  path: string;
  fileName?: string;
  caption?: string;
}

const OPEN = "[AGENT_WORKS_REMOTE_SEND]";
const CLOSE = "[/AGENT_WORKS_REMOTE_SEND]";
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

function isRemoteSendAction(value: unknown): value is RemoteSendAction {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.type !== "file" && item.type !== "image") return false;
  if (typeof item.path !== "string" || item.path.trim() === "") return false;
  if (item.fileName !== undefined && typeof item.fileName !== "string") return false;
  if (item.caption !== undefined && typeof item.caption !== "string") return false;
  return true;
}

export function parseRemoteSendProtocol(content: string): {
  visibleText: string;
  actions: RemoteSendAction[];
} {
  const actions: RemoteSendAction[] = [];
  let cursor = 0;
  let visibleText = "";

  while (cursor < content.length) {
    const start = content.indexOf(OPEN, cursor);
    if (start === -1) {
      visibleText += content.slice(cursor);
      break;
    }

    const end = content.indexOf(CLOSE, start + OPEN.length);
    if (end === -1) {
      visibleText += content.slice(cursor);
      break;
    }

    const before = content.slice(cursor, start);
    const body = content.slice(start + OPEN.length, end).trim();
    try {
      const parsed = JSON.parse(body) as unknown;
      if (!isRemoteSendAction(parsed)) throw new Error("invalid remote send action");
      visibleText += before;
      actions.push(parsed);
    } catch {
      visibleText += content.slice(cursor, end + CLOSE.length);
    }

    cursor = end + CLOSE.length;
  }

  return {
    visibleText: visibleText
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{2,}/g, "\n")
      .trim(),
    actions,
  };
}

function isInsideDir(filePath: string, dirPath: string): boolean {
  return filePath === dirPath || filePath.startsWith(`${dirPath}/`);
}

function resolveActionPath(actionPath: string, workspaceRoot: string): string {
  return isAbsolute(actionPath)
    ? resolve(actionPath)
    : resolve(workspaceRoot, actionPath);
}

export function resolveRemoteSendProtocol(input: {
  content: string;
  workspaceRoot: string;
  outputDir: string;
}): {
  visibleText: string;
  files: Array<{
    type: RemoteSendType;
    path: string;
    fileName?: string;
    caption?: string;
  }>;
  rejected: Array<RemoteSendAction & { reason: RemoteSendRejectReason }>;
} {
  const parsed = parseRemoteSendProtocol(input.content);
  const outputRealPath = realpathSync(input.outputDir);
  const files: Array<{
    type: RemoteSendType;
    path: string;
    fileName?: string;
    caption?: string;
  }> = [];
  const rejected: Array<RemoteSendAction & { reason: RemoteSendRejectReason }> = [];

  for (const action of parsed.actions) {
    const candidatePath = resolveActionPath(action.path, input.workspaceRoot);
    if (!existsSync(candidatePath)) {
      rejected.push({ ...action, reason: "not_found" });
      continue;
    }

    const realPath = realpathSync(candidatePath);
    if (!isInsideDir(realPath, outputRealPath)) {
      rejected.push({ ...action, reason: "outside_output" });
      continue;
    }

    const stat = statSync(realPath);
    if (!stat.isFile()) {
      rejected.push({ ...action, reason: "not_file" });
      continue;
    }
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      rejected.push({ ...action, reason: "too_large" });
      continue;
    }

    files.push({
      type: action.type,
      path: realPath,
      ...(action.fileName ? { fileName: action.fileName } : {}),
      ...(action.caption ? { caption: action.caption } : {}),
    });
  }

  return {
    visibleText: parsed.visibleText,
    files,
    rejected,
  };
}
