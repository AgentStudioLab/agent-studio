import type { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { nanoid } from "nanoid";
import { EventType } from "@ag-ui/core";
import type { RunWorkerInput } from "../../agent/runWorker";
import type { RunEventStore } from "../../agui/core";
import type { MessageService } from "../../services/messages";
import type { ThreadService } from "../../services/threads";
import type { ChannelConnectionService } from "../core/ChannelConnectionService";
import type { ChannelSessionService } from "../core/ChannelSessionService";
import type {
  ChannelType,
  RemoteTaskReplyState,
  RemoteTaskStatus,
} from "../core/ChannelTypes";
import type { UnifiedIncomingAttachment } from "../core/PluginRegistry";
import { resolveRemoteSendProtocol } from "./RemoteSendProtocol";

const ATTACHMENT_ONLY_INSTRUCTION = "Received remote attachments.";

export interface RemoteTaskRunInput {
  runId: string;
  threadId: string;
  prompt: string;
  appendContextExtra: string;
  permissionMode: "act-without-asking";
  userMessageId: string;
  onTerminalResult: RunWorkerInput["onTerminalResult"];
}

export interface RemoteTaskSendInput {
  taskId: string;
  connectionId: string;
  channelType: ChannelType;
  chatId: string;
  contextToken?: string;
  text: string;
  files: Array<{
    type: "file" | "image";
    path: string;
    fileName?: string;
    caption?: string;
  }>;
}

export interface RemoteTask {
  id: string;
  sessionId: string;
  connectionId: string;
  conversationId: string;
  runId: string;
  channelType: ChannelType;
  chatId: string;
  senderId: string;
  contextToken: string | null;
  status: RemoteTaskStatus;
  replyState: RemoteTaskReplyState;
  instructionText: string | null;
  inputDir: string;
  outputDir: string;
  resultSummary: string | null;
  resultFiles: RemoteTaskSendInput["files"];
  errorMsg: string | null;
  createdAt: number;
  updatedAt: number;
  onTerminalResult: NonNullable<RunWorkerInput["onTerminalResult"]>;
}

interface RemoteTaskRow {
  id: string;
  session_id: string;
  connection_id: string;
  conversation_id: string;
  run_id: string | null;
  channel_type: ChannelType;
  chat_id: string;
  sender_id: string;
  context_token: string | null;
  status: RemoteTaskStatus;
  reply_state: RemoteTaskReplyState;
  instruction_text: string | null;
  input_dir: string;
  output_dir: string;
  result_summary: string | null;
  result_files_json: string | null;
  error_msg: string | null;
  created_at: number;
  updated_at: number;
}

function defaultDataDir(): string {
  return join(homedir(), ".agent-studio");
}

function parseFiles(value: string | null): RemoteTaskSendInput["files"] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as RemoteTaskSendInput["files"]) : [];
  } catch {
    return [];
  }
}

export class RemoteTaskService {
  constructor(private deps: {
    db: Database;
    dataDir?: string;
    connections: ChannelConnectionService;
    sessions: ChannelSessionService;
    threads: ThreadService;
    messages: MessageService;
    store: RunEventStore;
    startRun: (input: RemoteTaskRunInput) => Promise<void>;
    sendResult: (input: RemoteTaskSendInput) => Promise<void>;
  }) {}

  async createReadyTask(input: {
    connectionId: string;
    channelType: ChannelType;
    chatId: string;
    senderId: string;
    displayName?: string;
    instructionText: string;
    attachments: UnifiedIncomingAttachment[];
    contextToken?: string;
  }): Promise<RemoteTask> {
    const connection = this.deps.connections.getInternal(input.connectionId);
    if (!connection) throw new Error(`channel connection ${input.connectionId} not found`);

    const workingDir =
      typeof connection.config.defaultWorkspace === "string" &&
      connection.config.defaultWorkspace.length > 0
        ? connection.config.defaultWorkspace
        : this.deps.dataDir ?? defaultDataDir();
    const existingSession = this.deps.sessions.find(
      input.connectionId,
      input.chatId,
      input.senderId,
    );
    const conversationId = existingSession?.conversationId ?? `rmt_conv_${nanoid(12)}`;
    if (!existingSession) {
      this.deps.threads.create({
        id: conversationId,
        title: `Remote ${input.channelType} task`,
        agentWorkspaceId:
          typeof connection.config.defaultAgentId === "string"
            ? connection.config.defaultAgentId
            : null,
        workingDir,
        permissionMode: "act-without-asking",
      });
    }
    const session =
      existingSession ??
      this.deps.sessions.getOrCreate({
        connectionId: input.connectionId,
        channelType: input.channelType,
        chatId: input.chatId,
        senderId: input.senderId,
        displayName: input.displayName,
        conversationId,
      });

    const taskId = `rmt_${nanoid(12)}`;
    const runId = `run_${nanoid(12)}`;
    const taskRoot = join(workingDir, "remote-tasks", taskId);
    const inputDir = join(taskRoot, "input");
    const outputDir = join(taskRoot, "output");
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    for (const attachment of input.attachments) {
      copyFileSync(attachment.path, join(inputDir, attachment.name || basename(attachment.path)));
    }

    const now = Date.now();
    this.deps.db
      .prepare(
        `INSERT INTO remote_tasks
          (id, session_id, connection_id, conversation_id, run_id, channel_type, chat_id,
           sender_id, context_token, status, reply_state, instruction_text, input_dir,
           output_dir, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', 'pending', ?, ?, ?, ?, ?)`,
      )
      .run(
        taskId,
        session.id,
        input.connectionId,
        conversationId,
        runId,
        input.channelType,
        input.chatId,
        input.senderId,
        input.contextToken ?? null,
        input.instructionText,
        inputDir,
        outputDir,
        now,
        now,
      );
    this.deps.sessions.setActiveTask(session.id, taskId);
    await this.deps.store.createRun(runId, conversationId);

    const task = this.get(taskId)!;
    const userMessage = this.deps.messages.appendUser(
      conversationId,
      this.buildVisibleUserMessage(input.instructionText, input.attachments),
    );
    await this.deps.startRun({
      runId,
      threadId: conversationId,
      prompt: this.buildPrompt(input.instructionText, input.attachments, inputDir, outputDir),
      appendContextExtra: this.buildAppendContextExtra(input.attachments, inputDir, outputDir),
      permissionMode: "act-without-asking",
      userMessageId: userMessage.id,
      onTerminalResult: task.onTerminalResult,
    });

    return task;
  }

  get(taskId: string): RemoteTask | null {
    const row = this.deps.db
      .prepare("SELECT * FROM remote_tasks WHERE id = ?")
      .get(taskId) as RemoteTaskRow | undefined;
    return row ? this.rowToTask(row) : null;
  }

  listRecent(limit = 50): RemoteTask[] {
    const rows = this.deps.db
      .prepare("SELECT * FROM remote_tasks ORDER BY created_at DESC LIMIT ?")
      .all(limit) as RemoteTaskRow[];
    return rows.map((row) => this.rowToTask(row));
  }

  async handleTerminalResult(
    taskId: string,
    result: {
      status: "completed" | "error" | "cancelled" | "awaiting_approval";
      assistantText: string;
      errorMsg?: string;
    },
  ): Promise<void> {
    const task = this.get(taskId);
    if (!task) return;
    if (result.status !== "completed") {
      this.updateTask(taskId, {
        status: "failed",
        replyState: "failed",
        errorMsg: result.errorMsg ?? result.status,
      });
      this.deps.sessions.clearActiveTask(task.sessionId, taskId);
      return;
    }

    const resolved = resolveRemoteSendProtocol({
      content: result.assistantText,
      workspaceRoot: this.deps.threads.get(task.conversationId)?.workingDir ?? task.outputDir,
      outputDir: task.outputDir,
    });
    const sendInput: RemoteTaskSendInput = {
      taskId,
      connectionId: task.connectionId,
      channelType: task.channelType,
      chatId: task.chatId,
      ...(task.contextToken ? { contextToken: task.contextToken } : {}),
      text: resolved.visibleText,
      files: resolved.files,
    };

    try {
      await this.deps.sendResult(sendInput);
      this.updateTask(taskId, {
        status: "completed",
        replyState: "sent",
        resultSummary: resolved.visibleText,
        resultFiles: resolved.files,
      });
    } catch (err) {
      this.updateTask(taskId, {
        status: "completed",
        replyState: "failed",
        resultSummary: resolved.visibleText,
        resultFiles: resolved.files,
        errorMsg: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.deps.sessions.clearActiveTask(task.sessionId, taskId);
    }
  }

  async recoverRunningTasks(): Promise<void> {
    const rows = this.deps.db
      .prepare("SELECT * FROM remote_tasks WHERE status = 'running'")
      .all() as RemoteTaskRow[];
    for (const row of rows) {
      if (!row.run_id) continue;
      const snap = await this.deps.store.getRun(row.run_id);
      if (!snap) {
        await this.handleTerminalResult(row.id, {
          status: "error",
          assistantText: "",
          errorMsg: "run missing",
        });
        continue;
      }
      if (snap.status === "completed") {
        await this.handleTerminalResult(row.id, {
          status: "completed",
          assistantText: this.assistantTextFromRunEvents(row.run_id),
        });
      } else if (snap.status === "error" || snap.status === "cancelled") {
        const runRow = this.deps.db
          .prepare("SELECT error_msg FROM runs WHERE id = ?")
          .get(row.run_id) as { error_msg: string | null } | undefined;
        await this.handleTerminalResult(row.id, {
          status: snap.status,
          assistantText: "",
          errorMsg: runRow?.error_msg ?? snap.status,
        });
      }
    }
  }

  private rowToTask(row: RemoteTaskRow): RemoteTask {
    return {
      id: row.id,
      sessionId: row.session_id,
      connectionId: row.connection_id,
      conversationId: row.conversation_id,
      runId: row.run_id ?? "",
      channelType: row.channel_type,
      chatId: row.chat_id,
      senderId: row.sender_id,
      contextToken: row.context_token,
      status: row.status,
      replyState: row.reply_state,
      instructionText: row.instruction_text,
      inputDir: row.input_dir,
      outputDir: row.output_dir,
      resultSummary: row.result_summary,
      resultFiles: parseFiles(row.result_files_json),
      errorMsg: row.error_msg,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      onTerminalResult: (result) => this.handleTerminalResult(row.id, result),
    };
  }

  private updateTask(
    taskId: string,
    input: {
      status?: RemoteTaskStatus;
      replyState?: RemoteTaskReplyState;
      resultSummary?: string;
      resultFiles?: RemoteTaskSendInput["files"];
      errorMsg?: string;
    },
  ): void {
    const existing = this.get(taskId);
    if (!existing) return;
    this.deps.db
      .prepare(
        `UPDATE remote_tasks
         SET status = ?,
             reply_state = ?,
             result_summary = ?,
             result_files_json = ?,
             error_msg = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status ?? existing.status,
        input.replyState ?? existing.replyState,
        input.resultSummary ?? existing.resultSummary,
        input.resultFiles ? JSON.stringify(input.resultFiles) : JSON.stringify(existing.resultFiles),
        input.errorMsg ?? existing.errorMsg,
        Date.now(),
        taskId,
      );
  }

  private buildPrompt(
    instructionText: string,
    attachments: UnifiedIncomingAttachment[],
    inputDir: string,
    outputDir: string,
  ): string {
    const lines = [
      "This request came from a remote IM channel.",
      "",
      "User request:",
      instructionText === ATTACHMENT_ONLY_INSTRUCTION && attachments.length > 0
        ? "The remote user sent attachments without additional text. Inspect the attachments and respond appropriately. If you need more details, ask the user in their language."
        : instructionText,
    ];

    if (attachments.length > 0) {
      lines.push(
        "",
        "Input files:",
        ...attachments.map((attachment) => `- ${attachment.name || basename(attachment.path)}`),
        "",
        `Input files are in: ${inputDir}`,
      );
    }
    lines.push("", `Write files for remote reply only under: ${outputDir}`);

    return lines.join("\n");
  }

  private buildVisibleUserMessage(
    instructionText: string,
    attachments: UnifiedIncomingAttachment[],
  ): string {
    if (attachments.length === 0) return instructionText;
    if (instructionText === ATTACHMENT_ONLY_INSTRUCTION) {
      return [
        "Attachments:",
        ...attachments.map((attachment) => `- ${attachment.name || basename(attachment.path)}`),
      ].join("\n");
    }
    return [
      instructionText,
      "",
      "Attachments:",
      ...attachments.map((attachment) => `- ${attachment.name || basename(attachment.path)}`),
    ].join("\n");
  }

  private buildAppendContextExtra(
    attachments: UnifiedIncomingAttachment[],
    inputDir: string,
    outputDir: string,
  ): string {
    const lines = [
      "Remote IM channel context:",
      "- Answer the remote user directly. Generate all user-visible text through the model response; do not rely on fixed channel-side text.",
      "- Match the user's language when possible.",
    ];

    lines.push(
      `- Output directory: ${outputDir}`,
      "- If files or images should be sent back, save final deliverables under the output directory and append one protocol block per file.",
      "- Without the protocol block, the app will not actually send the file.",
      '  [AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"<output-file-path>","fileName":"<optional-name>"}[/AGENT_WORKS_REMOTE_SEND]',
      "- Only files in the output directory can be sent back with [AGENT_WORKS_REMOTE_SEND].",
    );

    if (attachments.length > 0) {
      lines.push(
        `- Input directory: ${inputDir}`,
        "- Inspect the input directory when the request depends on received attachments.",
      );
    } else {
      lines.push(
        "- This message may be a normal question with no attachment. Reply normally; do not ask for a file unless the user's request specifically requires one.",
        "- If the user asks you to generate or send back a file, create it under the output directory and include the protocol block in the final answer.",
      );
    }

    return lines.join("\n");
  }

  private assistantTextFromRunEvents(runId: string): string {
    const rows = this.deps.db
      .prepare("SELECT payload FROM run_events WHERE run_id = ? ORDER BY seq ASC")
      .all(runId) as Array<{ payload: string }>;
    const chunks: string[] = [];
    for (const row of rows) {
      try {
        const event = JSON.parse(row.payload) as { type?: string; delta?: string; content?: string };
        if (event.type === EventType.TEXT_MESSAGE_CONTENT && typeof event.delta === "string") {
          chunks.push(event.delta);
        } else if (event.type === EventType.TEXT_MESSAGE_END && typeof event.content === "string") {
          chunks.push(event.content);
        }
      } catch {
        // Ignore malformed historical events.
      }
    }
    return chunks.join("");
  }
}
