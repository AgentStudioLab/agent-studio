import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { EventType } from "@ag-ui/core";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate } from "../../db";
import { createBunSqliteRunStore } from "../../agui/store-sqlite/createBunSqliteRunStore";
import { ThreadService } from "../../services/threads";
import { MessageService } from "../../services/messages";
import { ChannelConnectionService } from "../core/ChannelConnectionService";
import { ChannelSessionService } from "../core/ChannelSessionService";
import { RemoteTaskService } from "./RemoteTaskService";

const tmpRoots: string[] = [];

function makeDeps() {
  const root = mkdtempSync(join(tmpdir(), "remote-task-"));
  tmpRoots.push(root);
  const db = new Database(":memory:");
  migrate(db);
  const connections = new ChannelConnectionService(db);
  const sessions = new ChannelSessionService(db);
  const threads = new ThreadService(db);
  const messages = new MessageService(db);
  const store = createBunSqliteRunStore(db);
  const started: unknown[] = [];
  const sent: unknown[] = [];
  const service = new RemoteTaskService({
    db,
    dataDir: root,
    connections,
    sessions,
    threads,
    messages,
    store,
    startRun: async (input) => {
      started.push(input);
    },
    sendResult: async (input) => {
      sent.push(input);
    },
  });
  return { root, db, connections, sessions, threads, messages, store, started, sent, service };
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("RemoteTaskService", () => {
  it("creates task dirs, conversation, run row and starts a remote run", async () => {
    const { root, connections, db, started, service } = makeDeps();
    const inputFile = join(root, "incoming.txt");
    writeFileSync(inputFile, "hello");
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: {
        permissionStrategy: "auto_execute",
        defaultWorkspace: root,
        defaultAgentId: "agw_1",
      },
    });

    const task = await service.createReadyTask({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      displayName: "Alice",
      instructionText: "summarize",
      attachments: [{ type: "file", path: inputFile, name: "incoming.txt" }],
      contextToken: "ctx_1",
    });

    expect(existsSync(join(task.inputDir, "incoming.txt"))).toBe(true);
    expect(existsSync(task.outputDir)).toBe(true);
    expect(readFileSync(join(task.inputDir, "incoming.txt"), "utf8")).toBe("hello");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      runId: task.runId,
      threadId: task.conversationId,
      permissionMode: "act-without-asking",
    });
    expect((started[0] as { prompt: string }).prompt).toContain("summarize");
    expect((started[0] as { appendContextExtra: string }).appendContextExtra).toContain(
      task.outputDir,
    );
    expect(
      db.prepare("SELECT status, reply_state FROM remote_tasks WHERE id = ?").get(task.id),
    ).toEqual({ status: "running", reply_state: "pending" });
  });

  it("marks completed, strips protocol blocks, sends summary and output files", async () => {
    const { root, connections, sent, service } = makeDeps();
    const inputFile = join(root, "incoming.txt");
    writeFileSync(inputFile, "hello");
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute", defaultWorkspace: root },
    });
    const task = await service.createReadyTask({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      instructionText: "summarize",
      attachments: [{ type: "file", path: inputFile, name: "incoming.txt" }],
      contextToken: "ctx_1",
    });
    const outputFile = join(task.outputDir, "result.txt");
    writeFileSync(outputFile, "done");

    await task.onTerminalResult({
      status: "completed",
      assistantText: `Done\n[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"${outputFile}"}[/AGENT_WORKS_REMOTE_SEND]`,
    });

    expect(service.get(task.id)).toMatchObject({
      status: "completed",
      replyState: "sent",
      resultSummary: "Done",
    });
    expect(sent).toEqual([
      {
        taskId: task.id,
        connectionId: connection.id,
        channelType: "fake",
        chatId: "chat_1",
        contextToken: "ctx_1",
        text: "Done",
        files: [{ type: "file", path: realpathSync(outputFile) }],
      },
    ]);
  });

  it("marks failed on run error", async () => {
    const { root, connections, service } = makeDeps();
    const inputFile = join(root, "incoming.txt");
    writeFileSync(inputFile, "hello");
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute", defaultWorkspace: root },
    });
    const task = await service.createReadyTask({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      instructionText: "summarize",
      attachments: [{ type: "file", path: inputFile, name: "incoming.txt" }],
    });

    await task.onTerminalResult({
      status: "error",
      assistantText: "",
      errorMsg: "provider failed",
    });

    expect(service.get(task.id)).toMatchObject({
      status: "failed",
      replyState: "failed",
      errorMsg: "provider failed",
    });
  });

  it("recovers running tasks whose runs already completed or errored", async () => {
    const { root, connections, store, sent, service } = makeDeps();
    const inputFile = join(root, "incoming.txt");
    writeFileSync(inputFile, "hello");
    const connection = connections.create({
      type: "fake",
      name: "Fake",
      config: { permissionStrategy: "auto_execute", defaultWorkspace: root },
    });
    const completed = await service.createReadyTask({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_1",
      senderId: "sender_1",
      instructionText: "summarize",
      attachments: [{ type: "file", path: inputFile, name: "incoming.txt" }],
    });
    await store.appendEvent(completed.runId, {
      type: EventType.TEXT_MESSAGE_CONTENT,
      delta: "Recovered",
    } as never);
    await store.finishRun(completed.runId, "completed");

    const failed = await service.createReadyTask({
      connectionId: connection.id,
      channelType: "fake",
      chatId: "chat_2",
      senderId: "sender_1",
      instructionText: "summarize",
      attachments: [{ type: "file", path: inputFile, name: "incoming.txt" }],
    });
    await store.finishRun(failed.runId, "error", "crashed");

    await service.recoverRunningTasks();

    expect(service.get(completed.id)).toMatchObject({
      status: "completed",
      replyState: "sent",
      resultSummary: "Recovered",
    });
    expect(service.get(failed.id)).toMatchObject({
      status: "failed",
      replyState: "failed",
      errorMsg: "crashed",
    });
    expect(sent).toHaveLength(1);
  });
});
