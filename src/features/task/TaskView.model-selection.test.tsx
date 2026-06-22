import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { ProviderModelSelection } from "@/lib/data/settings";

const sendMock = mock(async (_text: string, _opts?: unknown) => {});
const regenerateMock = mock(async (_id: string, _opts?: unknown) => {});
const runningThreadIds = new Set<string>();
const queuedMessagesByThread = new Map<string, Array<{ id: string; text: string }>>();
const shouldFailModelUpdates = new Set<string>();
const delayedModelUpdateFailures = new Map<string, Promise<void>>();
const releaseModelUpdateFailure = new Map<string, () => void>();
const updateConversationModelMutate = mock(
  (_vars: { id: string; model: string | null }) => {},
);
let currentPickerSelection: ProviderModelSelection | null = null;

mock.module("@/app/AppShell", () => ({
  AppShell: ({ main }: { main: ReactNode }) => <>{main}</>,
}));

mock.module("@/app/AppShellContext", () => ({
  useAppShell: () => ({
    pendingFirstPrompt: null,
    setPendingFirstPrompt: mock(() => {}),
    preview: { open: false, file: null },
    openPreview: mock(() => {}),
    closePreview: mock(() => {}),
  }),
}));

mock.module("@/shared/RenameDialog", () => ({
  RenameDialog: () => null,
}));

mock.module("@/features/task/TaskHeader", () => ({
  TaskHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

mock.module("@/features/task/ChatStream", () => ({
  ChatStream: ({ onRegenerate }: { onRegenerate: (id: string) => void }) => (
    <button type="button" onClick={() => onRegenerate("msg_user_1")}>
      Regenerate
    </button>
  ),
}));

mock.module("@/features/task/TaskRightPanel", () => ({
  TaskRightPanel: () => null,
}));

mock.module("@/features/task/QueuedMessagesPanel", () => ({
  QueuedMessagesPanel: () => <div data-testid="queue-panel" />,
}));

mock.module("@/features/task/PreviewPane", () => ({
  PreviewPane: () => null,
}));

mock.module("@/features/task/TaskMessageInput", () => ({
  TaskMessageInput: ({
    providerSelection,
    onProviderSelectionChange,
    onSend,
  }: {
    providerSelection: ProviderModelSelection | null;
    onProviderSelectionChange: (selection: ProviderModelSelection) => void;
    onSend: (text: string) => void;
  }) => {
    currentPickerSelection = providerSelection;
    return (
      <div data-testid="message-input">
        <button
          type="button"
          onClick={() =>
            onProviderSelectionChange({
              providerId: "conn-alt-openai",
              modelId: "gpt-5.1",
            })
          }
        >
          Switch duplicate model
        </button>
        <button
          type="button"
          onClick={() =>
            onProviderSelectionChange({
              providerId: "conn-sf",
              modelId: "deepseek-ai/DeepSeek-V3.2",
            })
          }
        >
          Switch model
        </button>
        <button
          type="button"
          onClick={() =>
            onProviderSelectionChange({
              providerId: "conn-qwen",
              modelId: "qwen/Qwen3-Coder",
            })
          }
        >
          Switch model again
        </button>
        <button type="button" onClick={() => onSend("Next message")}>
          Send message
        </button>
      </div>
    );
  },
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) => {
      if (key === "task.todos.trigger") {
        return `Tasks ${values?.completed ?? 0}/${values?.total ?? 0}`;
      }
      if (key === "task.todos.activePrefix") return "Now";
      return key;
    },
  }),
}));

mock.module("@/lib/agui/react/useThreadTasks", () => ({
  useThreadTasks: () => ({
    tasks: [
      {
        id: "task_1",
        subject: "Wire the task trigger",
        description: "",
        activeForm: "Wiring the task trigger",
        status: "in_progress",
        updatedAt: 1,
      },
    ],
  }),
}));

mock.module("@/lib/agui/react/useChat", () => ({
  useChat: ({ threadId }: { threadId: string }) => ({
    viewMessages: [{ id: "msg_user_1", role: "user", content: "Hello" }],
    state: {},
    runtime: { getState: () => ({ activeRunId: null }) },
    isRunning: runningThreadIds.has(threadId),
    isThinking: false,
    error: null,
    send: sendMock,
    regenerate: regenerateMock,
    cancel: mock(async () => {}),
    attachToRun: mock(() => {}),
    setHistoricalMessages: mock(() => {}),
    pendingInterrupts: [],
    resumeRun: mock(async () => {}),
  }),
}));

mock.module("@/lib/agui/react/useThreadStatuses", () => ({
  useActiveRunForThread: () => null,
  useThreadStatuses: () => ({ data: [] }),
}));

mock.module("@/lib/agui/react/useThreadUnread", () => ({
  useThreadUnread: () => ({ markRead: mock(() => {}) }),
}));

mock.module("@/lib/agui/react/useAllowedTools", () => ({
  useAllowedTools: () => ({ allowedTools: new Set<string>() }),
}));

mock.module("@/lib/agui/react/useWorkspaceAllowedTools", () => ({
  useWorkspaceAllowedTools: () => ({
    allowedTools: new Set<string>(),
    addAllowedTool: mock(() => {}),
  }),
}));

mock.module("@/lib/agui/react/useThreadPermissionMode", () => ({
  useThreadPermissionMode: () => ({
    mode: "ask",
    setMode: mock(() => {}),
  }),
}));

mock.module("@/features/task/MessageQueueContext", () => ({
  useMessageQueue: (threadId: string | null) => ({
    items: queuedMessagesByThread.get(threadId ?? "") ?? [],
    add: mock(() => {}),
    remove: mock(() => {}),
    popHead: mock(() => queuedMessagesByThread.get(threadId ?? "")?.shift() ?? null),
    clearUserCancelled: mock(() => {}),
    markUserCancelled: mock(() => {}),
    userCancelled: false,
  }),
}));

mock.module("@/features/auth/useAuth", () => ({
  useAuth: () => ({
    ensureAuthenticated: mock(async () => {}),
    getValidAccessToken: mock(async () => "token"),
    refreshUser: mock(async () => {}),
  }),
}));

mock.module("@/features/task/officialRunAuth", () => ({
  buildOfficialRunAuthFields: mock(async () => ({})),
}));

mock.module("@/lib/sidecar-client", () => ({
  authedFetch: async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && path.startsWith("/conversations/")) {
      if (path.endsWith("/messages")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const threadId = path.split("/")[2] ?? null;
      return new Response(JSON.stringify(conversationForThread(threadId)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "PATCH" && path.startsWith("/conversations/")) {
      const threadId = path.split("/")[2] ?? null;
      const parsed = init?.body
        ? (JSON.parse(String(init.body)) as {
            archived?: boolean;
            model?: string | null;
          })
        : {};
      if ("model" in parsed) {
        updateConversationModelMutate(
          { id: threadId ?? "", model: parsed.model ?? null },
        );
        if (
          parsed.model !== null &&
          shouldFailModelUpdates.has(parsed.model)
        ) {
          await delayedModelUpdateFailures.get(parsed.model);
          return new Response(JSON.stringify({ error: "boom" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response(
        JSON.stringify({
          ...conversationForThread(threadId),
          model:
            "model" in parsed
              ? parsed.model ?? null
              : conversationForThread(threadId).model,
          archived: parsed.archived ?? false,
          updatedAt: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "unhandled" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
}));

mock.module("@/lib/data/settings", () => ({
  getProvider: mock(async () => ({
    defaultSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
    enabledModels: [
      {
        providerId: "conn-alt-openai",
        providerName: "Alt OpenAI",
        providerLabel: "Alt OpenAI",
        managed: false,
        modelId: "gpt-5.1",
        modelLabel: "Alt GPT-5.1",
        modelDescription: "Duplicate",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://alt-openai.example/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
      {
        providerId: "conn-openai",
        providerName: "OpenAI",
        providerLabel: "OpenAI",
        managed: false,
        modelId: "gpt-5.1",
        modelLabel: "GPT-5.1",
        modelDescription: "Flagship",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
      {
        providerId: "conn-qwen",
        providerName: "Qwen",
        providerLabel: "Qwen",
        managed: false,
        modelId: "qwen/Qwen3-Coder",
        modelLabel: "Qwen3 Coder",
        modelDescription: "Coding",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
      {
        providerId: "conn-sf",
        providerName: "SiliconFlow",
        providerLabel: "SiliconFlow",
        managed: false,
        modelId: "deepseek-ai/DeepSeek-V3.2",
        modelLabel: "DeepSeek V3.2",
        modelDescription: "Remote",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.siliconflow.cn/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
    ],
  })),
}));

function conversationForThread(id: string | null) {
  if (id === "thr_2") {
    return {
      id: "thr_2",
      title: "Thread 2",
      workingDir: "/tmp/work-2",
      model: "qwen/Qwen3-Coder",
      agentWorkspaceId: null,
      scheduledTaskId: null,
      permissionMode: null,
    };
  }

  return {
    id: "thr_1",
    title: "Thread",
    workingDir: "/tmp/work",
    model: "gpt-5.1",
    agentWorkspaceId: null,
    scheduledTaskId: null,
    permissionMode: null,
  };
}

const { queryKeys } = require("@/lib/data/queries") as typeof import("@/lib/data/queries");
const { TaskView } = require("./TaskView") as typeof import("./TaskView");

function delayModelUpdateFailure(model: string) {
  shouldFailModelUpdates.add(model);
  delayedModelUpdateFailures.set(
    model,
    new Promise<void>((resolve) => {
      releaseModelUpdateFailure.set(model, resolve);
    }),
  );
}

function ThreadNav() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/task/thr_2")}>
        Go to thread 2
      </button>
      <button type="button" onClick={() => navigate("/task/thr_1")}>
        Go to thread 1
      </button>
    </>
  );
}

function renderTaskView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(queryKeys.detail("thr_1"), conversationForThread("thr_1"));
  qc.setQueryData(queryKeys.detail("thr_2"), conversationForThread("thr_2"));
  qc.setQueryData(queryKeys.messages("thr_1"), []);
  qc.setQueryData(queryKeys.messages("thr_2"), []);
  return render(
    <MemoryRouter initialEntries={["/task/thr_1"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route
            path="/task/:threadId"
            element={
              <>
                <TaskView />
                <ThreadNav />
              </>
            }
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sendMock.mockClear();
  regenerateMock.mockClear();
  updateConversationModelMutate.mockClear();
  runningThreadIds.clear();
  queuedMessagesByThread.clear();
  shouldFailModelUpdates.clear();
  delayedModelUpdateFailures.clear();
  releaseModelUpdateFailure.clear();
  currentPickerSelection = null;
});

afterEach(() => cleanup());

afterAll(() => {
  mock.restore();
});

describe("TaskView conversation model selection", () => {
  it("renders the task trigger above the message input when tasks exist", async () => {
    renderTaskView();

    const queuePanel = await screen.findByTestId("queue-panel");
    const taskTrigger = await screen.findByRole("button", { name: /tasks 0\/1/i });
    const messageInput = screen.getByTestId("message-input");
    const following = document.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING;

    expect(
      queuePanel.compareDocumentPosition(taskTrigger) & following,
    ).toBeTruthy();
    expect(
      taskTrigger.compareDocumentPosition(messageInput) & following,
    ).toBeTruthy();
  });

  it("allows changing the model after messages exist and uses it for the next send", async () => {
    renderTaskView();

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-openai",
        modelId: "gpt-5.1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));

    await waitFor(() =>
      expect(updateConversationModelMutate).toHaveBeenCalledWith({
        id: "thr_1",
        model: "deepseek-ai/DeepSeek-V3.2",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Next message",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-sf",
            modelId: "deepseek-ai/DeepSeek-V3.2",
          },
        }),
      ),
    );
  });

  it("uses the current model selection for regenerate", async () => {
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    await waitFor(() =>
      expect(regenerateMock).toHaveBeenCalledWith(
        "msg_user_1",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-sf",
            modelId: "deepseek-ai/DeepSeek-V3.2",
          },
        }),
      ),
    );
  });

  it("does not let a stale rollback override a newer model choice", async () => {
    shouldFailModelUpdates.add("deepseek-ai/DeepSeek-V3.2");
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch model again" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Next message",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-qwen",
            modelId: "qwen/Qwen3-Coder",
          },
        }),
      ),
    );
  });

  it("rolls stacked model update failures back to the durable conversation model", async () => {
    delayModelUpdateFailure("deepseek-ai/DeepSeek-V3.2");
    delayModelUpdateFailure("qwen/Qwen3-Coder");
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch model again" }));

    releaseModelUpdateFailure.get("qwen/Qwen3-Coder")?.();
    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );

    releaseModelUpdateFailure.get("deepseek-ai/DeepSeek-V3.2")?.();
    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-openai",
        modelId: "gpt-5.1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Next message",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-openai",
            modelId: "gpt-5.1",
          },
        }),
      ),
    );
  });

  it("uses the next thread conversation model after route changes", async () => {
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to thread 2" }));

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-qwen",
        modelId: "qwen/Qwen3-Coder",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Next message",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-qwen",
            modelId: "qwen/Qwen3-Coder",
          },
        }),
      ),
    );
  });

  it("auto-flushes a queued message after route changes with the next thread model", async () => {
    runningThreadIds.add("thr_1");
    queuedMessagesByThread.set("thr_2", [{ id: "queued_1", text: "Queued on two" }]);
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    runningThreadIds.delete("thr_1");
    fireEvent.click(screen.getByRole("button", { name: "Go to thread 2" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Queued on two",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-qwen",
            modelId: "qwen/Qwen3-Coder",
          },
        }),
      ),
    );
  });

  it("keeps each thread local provider selection after switching away and back", async () => {
    renderTaskView();

    fireEvent.click(
      await screen.findByRole("button", { name: "Switch duplicate model" }),
    );

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-alt-openai",
        modelId: "gpt-5.1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to thread 2" }));

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-qwen",
        modelId: "qwen/Qwen3-Coder",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to thread 1" }));

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-alt-openai",
        modelId: "gpt-5.1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(sendMock).toHaveBeenCalledWith(
        "Next message",
        expect.objectContaining({
          providerSelection: {
            providerId: "conn-alt-openai",
            modelId: "gpt-5.1",
          },
        }),
      ),
    );
  });
});
