import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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
const mutationErrorHandlers: Array<(() => void) | undefined> = [];
const updateConversationModelMutate = mock(
  (_vars: { id: string; model: string | null }, opts?: { onError?: () => void }) => {
    mutationErrorHandlers.push(opts?.onError);
  },
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
  QueuedMessagesPanel: () => null,
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
      <div>
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

mock.module("@/lib/agui/react/useChat", () => ({
  useChat: () => ({
    viewMessages: [{ id: "msg_user_1", role: "user", content: "Hello" }],
    state: {},
    runtime: { getState: () => ({ activeRunId: null }) },
    isRunning: false,
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
  useMessageQueue: () => ({
    items: [],
    add: mock(() => {}),
    remove: mock(() => {}),
    popHead: mock(() => null),
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

mock.module("@/lib/data/settings", () => ({
  getProvider: mock(async () => ({
    defaultSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
    enabledModels: [
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

mock.module("@/lib/data/queries", () => ({
  useArchiveConversationMutation: () => ({ mutate: mock(() => {}) }),
  useConversation: (threadId: string | null) => ({
    data: conversationForThread(threadId),
  }),
  useMessages: () => ({ data: [], isLoading: false }),
  useUpdateConversationModelMutation: () => ({
    mutate: updateConversationModelMutate,
  }),
}));

const { TaskView } = require("./TaskView") as typeof import("./TaskView");

function ThreadNav() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/task/thr_2")}>
      Go to thread 2
    </button>
  );
}

function renderTaskView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  mutationErrorHandlers.length = 0;
  currentPickerSelection = null;
});

afterEach(() => cleanup());

describe("TaskView conversation model selection", () => {
  it("allows changing the model after messages exist and uses it for the next send", async () => {
    renderTaskView();

    await waitFor(() =>
      expect(currentPickerSelection).toEqual({
        providerId: "conn-openai",
        modelId: "gpt-5.1",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));

    expect(updateConversationModelMutate).toHaveBeenCalledWith(
      {
        id: "thr_1",
        model: "deepseek-ai/DeepSeek-V3.2",
      },
      expect.any(Object),
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
    renderTaskView();

    fireEvent.click(await screen.findByRole("button", { name: "Switch model" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch model again" }));
    await act(async () => {
      mutationErrorHandlers[0]?.();
    });
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
});
