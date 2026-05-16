import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";

const meta: Meta = {
  title: "AI Elements/Tool",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

const lsCommand = { command: "ls -la ~/Workspace" };
const lsOutput =
  "total 32\ndrwxr-xr-x 8 user staff 256 May 16 14:00 .\ndrwxr-xr-x 5 user staff 160 May 16 13:58 ..\n-rw-r--r-- 1 user staff  42 May 16 14:00 README.md";

export const Pending: Story = {
  render: () => (
    <Tool>
      <ToolHeader state="input-streaming" type="tool-bash" />
      <ToolContent>
        <ToolInput input={lsCommand} />
      </ToolContent>
    </Tool>
  ),
};

export const Running: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader state="input-available" type="tool-bash" />
      <ToolContent>
        <ToolInput input={lsCommand} />
      </ToolContent>
    </Tool>
  ),
};

export const Done: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader state="output-available" type="tool-bash" />
      <ToolContent>
        <ToolInput input={lsCommand} />
        <ToolOutput errorText={undefined} output={lsOutput} />
      </ToolContent>
    </Tool>
  ),
};

export const Failed: Story = {
  render: () => (
    <Tool defaultOpen>
      <ToolHeader state="output-error" type="tool-bash" />
      <ToolContent>
        <ToolInput input={{ command: "missing-cmd" }} />
        <ToolOutput
          errorText="command not found: missing-cmd"
          output={undefined}
        />
      </ToolContent>
    </Tool>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        maxWidth: "640px",
      }}
    >
      <Tool>
        <ToolHeader state="input-streaming" type="tool-bash" />
        <ToolContent>
          <ToolInput input={lsCommand} />
        </ToolContent>
      </Tool>
      <Tool defaultOpen>
        <ToolHeader state="input-available" type="tool-bash" />
        <ToolContent>
          <ToolInput input={lsCommand} />
        </ToolContent>
      </Tool>
      <Tool defaultOpen>
        <ToolHeader state="output-available" type="tool-bash" />
        <ToolContent>
          <ToolInput input={lsCommand} />
          <ToolOutput errorText={undefined} output={lsOutput} />
        </ToolContent>
      </Tool>
      <Tool defaultOpen>
        <ToolHeader state="output-error" type="tool-bash" />
        <ToolContent>
          <ToolInput input={{ command: "missing-cmd" }} />
          <ToolOutput
            errorText="command not found: missing-cmd"
            output={undefined}
          />
        </ToolContent>
      </Tool>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Tool defaultOpen>
          <ToolHeader state="output-available" type="tool-bash" />
          <ToolContent>
            <ToolInput input={{ command: "ls" }} />
            <ToolOutput errorText={undefined} output="file1\nfile2" />
          </ToolContent>
        </Tool>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <Tool defaultOpen>
          <ToolHeader state="output-available" type="tool-bash" />
          <ToolContent>
            <ToolInput input={{ command: "ls" }} />
            <ToolOutput errorText={undefined} output="file1\nfile2" />
          </ToolContent>
        </Tool>
      </div>
    </div>
  ),
};
