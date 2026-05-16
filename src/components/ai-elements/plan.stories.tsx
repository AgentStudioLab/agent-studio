import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { CheckIcon, CircleIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

const meta: Meta<typeof Plan> = {
  title: "AI Elements/Plan",
  component: Plan,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Plan>;

type StepState = "done" | "active" | "pending" | "failed";

interface Step {
  state: StepState;
  description: string;
}

// PRD § 7.2 step state color mapping:
//   done    → success-100 filled + check
//   active  → brand-100 filled + pulsing
//   pending → transparent + dashed border on text-400
//   failed  → danger-100 filled + X
const StepMarker = ({ state }: { state: StepState }) => {
  if (state === "done") {
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: "hsl(var(--success-100))" }}
      >
        <CheckIcon className="size-3 text-white" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className="flex size-5 shrink-0 animate-pulse items-center justify-center rounded-full"
        style={{ background: "hsl(var(--brand-100))" }}
      >
        <CircleIcon className="size-2 fill-white text-white" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span
        className="flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: "hsl(var(--danger-100))" }}
      >
        <XIcon className="size-3 text-white" />
      </span>
    );
  }
  // pending
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed bg-transparent"
      style={{ borderColor: "hsl(var(--text-400))" }}
    />
  );
};

const StepRow = ({ state, description }: Step) => (
  <li className="flex items-center gap-3 py-1.5">
    <StepMarker state={state} />
    <span
      className={
        state === "pending"
          ? "text-sm text-muted-foreground"
          : state === "failed"
            ? "text-sm text-foreground line-through"
            : "text-sm text-foreground"
      }
    >
      {description}
    </span>
  </li>
);

const StepList = ({ steps }: { steps: Step[] }) => (
  <ul className="flex flex-col">
    {steps.map((s, i) => (
      <StepRow key={i} {...s} />
    ))}
  </ul>
);

const PlanShell = ({
  title = "执行计划",
  description = "扫描工作区并生成清理报表",
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) => (
  <div style={{ maxWidth: "560px" }}>
    <Plan defaultOpen>
      <PlanHeader>
        <div className="min-w-0">
          <PlanTitle>{title}</PlanTitle>
          <PlanDescription>{description}</PlanDescription>
        </div>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent>{children}</PlanContent>
    </Plan>
  </div>
);

export const MixedStates: Story = {
  render: () => (
    <PlanShell>
      <StepList
        steps={[
          { state: "done", description: "扫描 ~/Workspace" },
          { state: "done", description: "聚合磁盘占用" },
          { state: "active", description: "生成清理建议报表" },
          { state: "pending", description: "格式化为 xlsx" },
        ]}
      />
    </PlanShell>
  ),
};

export const AllStates: Story = {
  render: () => (
    <PlanShell
      title="所有状态示例"
      description="演示 done / active / pending / failed 四种步骤状态"
    >
      <StepList
        steps={[
          { state: "done", description: "已完成的步骤" },
          { state: "active", description: "正在执行的步骤" },
          { state: "pending", description: "等待执行的步骤" },
          { state: "failed", description: "失败的步骤" },
        ]}
      />
    </PlanShell>
  ),
};

export const SideBySide: Story = {
  render: () => {
    const steps: Step[] = [
      { state: "done", description: "扫描 ~/Workspace" },
      { state: "active", description: "生成报表" },
      { state: "pending", description: "格式化为 xlsx" },
      { state: "failed", description: "上传到云端" },
    ];
    return (
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
          <PlanShell>
            <StepList steps={steps} />
          </PlanShell>
        </div>
        <div
          data-mode="dark"
          style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
        >
          <PlanShell>
            <StepList steps={steps} />
          </PlanShell>
        </div>
      </div>
    );
  },
};
