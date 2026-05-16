import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { CheckIcon, CircleIcon, FileTextIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

const meta: Meta<typeof Task> = {
  title: "AI Elements/Task",
  component: Task,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Task>;

type TaskState = "done" | "active" | "pending" | "failed";

// PRD § 4.2 state color mapping (shared with Plan):
//   done    → success-100 filled + check
//   active  → brand-100 filled + pulsing dot
//   pending → text-400 dashed ring
//   failed  → danger-100 filled + X
const StateMarker = ({ state }: { state: TaskState }) => {
  if (state === "done") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full"
        style={{ background: "hsl(var(--success-100))" }}
      >
        <CheckIcon className="size-3 text-white" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className="flex size-4 shrink-0 animate-pulse items-center justify-center rounded-full"
        style={{ background: "hsl(var(--brand-100))" }}
      >
        <CircleIcon className="size-2 fill-white text-white" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full"
        style={{ background: "hsl(var(--danger-100))" }}
      >
        <XIcon className="size-2.5 text-white" />
      </span>
    );
  }
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed bg-transparent"
      style={{ borderColor: "hsl(var(--text-400))" }}
    />
  );
};

const StatefulItem = ({
  state,
  children,
}: {
  state: TaskState;
  children: ReactNode;
}) => (
  <TaskItem>
    <span className="flex items-center gap-2">
      <StateMarker state={state} />
      <span
        className={
          state === "pending"
            ? "text-muted-foreground"
            : state === "failed"
              ? "text-foreground line-through"
              : "text-foreground"
        }
      >
        {children}
      </span>
    </span>
  </TaskItem>
);

const Shell = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: "520px" }}>{children}</div>
);

export const Single: Story = {
  render: () => (
    <Shell>
      <Task>
        <TaskTrigger title="Visual QA on 7 cells" />
        <TaskContent>
          <StatefulItem state="active">扫描 ~/Workspace 中的 cells</StatefulItem>
        </TaskContent>
      </Task>
    </Shell>
  ),
};

export const WithSubtasks: Story = {
  render: () => (
    <Shell>
      <Task>
        <TaskTrigger title="Visual QA on 7 cells" />
        <TaskContent>
          <StatefulItem state="done">
            读取
            <TaskItemFile className="ml-1">
              <FileTextIcon className="size-3" />
              cell-01.tsx
            </TaskItemFile>
          </StatefulItem>
          <StatefulItem state="done">
            读取
            <TaskItemFile className="ml-1">
              <FileTextIcon className="size-3" />
              cell-02.tsx
            </TaskItemFile>
          </StatefulItem>
          <StatefulItem state="active">
            分析
            <TaskItemFile className="ml-1">
              <FileTextIcon className="size-3" />
              cell-03.tsx
            </TaskItemFile>
          </StatefulItem>
        </TaskContent>
      </Task>
    </Shell>
  ),
};

export const AllStates: Story = {
  render: () => (
    <Shell>
      <Task>
        <TaskTrigger title="所有状态示例" />
        <TaskContent>
          <StatefulItem state="done">已完成的子任务</StatefulItem>
          <StatefulItem state="active">正在执行的子任务</StatefulItem>
          <StatefulItem state="pending">等待执行的子任务</StatefulItem>
          <StatefulItem state="failed">失败的子任务</StatefulItem>
        </TaskContent>
      </Task>
    </Shell>
  ),
};

export const SideBySide: Story = {
  render: () => {
    const inner = (
      <Task>
        <TaskTrigger title="Visual QA on 7 cells" />
        <TaskContent>
          <StatefulItem state="done">
            读取
            <TaskItemFile className="ml-1">
              <FileTextIcon className="size-3" />
              cell-01.tsx
            </TaskItemFile>
          </StatefulItem>
          <StatefulItem state="active">
            分析
            <TaskItemFile className="ml-1">
              <FileTextIcon className="size-3" />
              cell-02.tsx
            </TaskItemFile>
          </StatefulItem>
          <StatefulItem state="pending">格式化输出</StatefulItem>
        </TaskContent>
      </Task>
    );
    return (
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
          {inner}
        </div>
        <div
          data-mode="dark"
          style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
        >
          {inner}
        </div>
      </div>
    );
  },
};
