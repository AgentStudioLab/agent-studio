import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";

const meta: Meta<typeof Confirmation> = {
  title: "AI Elements/Confirmation",
  component: Confirmation,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Confirmation>;

const BashCommandBlock = ({ command }: { command: string }) => (
  <div className="mt-1 rounded-sm bg-muted px-2 py-1.5 font-mono text-[12.5px] text-foreground">
    {command}
  </div>
);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 480 }}>{children}</div>
);

export const BashCommand: Story = {
  render: () => (
    <Frame>
      <Confirmation
        approval={{ id: "bash-1" }}
        state="approval-requested"
      >
        <ConfirmationRequest>
          <ConfirmationTitle>
            Allow shell command?
            <BashCommandBlock command="ls -la /Users/jay/Workspace" />
          </ConfirmationTitle>
        </ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline">Deny</ConfirmationAction>
          <ConfirmationAction>Allow once</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </Frame>
  ),
};

export const FileWrite: Story = {
  render: () => (
    <Frame>
      <Confirmation
        approval={{ id: "write-1" }}
        state="approval-requested"
      >
        <ConfirmationRequest>
          <ConfirmationTitle>
            Allow writing to{" "}
            <code className="font-mono text-[13px] text-foreground">
              ~/Documents/report.xlsx
            </code>
            ?
          </ConfirmationTitle>
        </ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline">Deny</ConfirmationAction>
          <ConfirmationAction>Allow</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </Frame>
  ),
};

export const BrowserAction: Story = {
  render: () => (
    <Frame>
      <Confirmation
        approval={{ id: "open-1" }}
        state="approval-requested"
      >
        <ConfirmationRequest>
          <ConfirmationTitle>
            Allow opening{" "}
            <code className="font-mono text-[13px] text-foreground">
              https://anthropic.com
            </code>
            ?
          </ConfirmationTitle>
        </ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline">Deny</ConfirmationAction>
          <ConfirmationAction>Open</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </Frame>
  ),
};

export const Accepted: Story = {
  render: () => (
    <Frame>
      <Confirmation
        approval={{ id: "bash-1", approved: true }}
        state="output-available"
      >
        <ConfirmationAccepted>
          <ConfirmationTitle>
            Shell command allowed.
            <BashCommandBlock command="ls -la /Users/jay/Workspace" />
          </ConfirmationTitle>
        </ConfirmationAccepted>
      </Confirmation>
    </Frame>
  ),
};

export const Rejected: Story = {
  render: () => (
    <Frame>
      <Confirmation
        approval={{ id: "bash-1", approved: false, reason: "Denied by user." }}
        state="output-denied"
      >
        <ConfirmationRejected>
          <ConfirmationTitle>
            Shell command denied.
            <BashCommandBlock command="rm -rf /" />
          </ConfirmationTitle>
        </ConfirmationRejected>
      </Confirmation>
    </Frame>
  ),
};

const Sample = () => (
  <Confirmation approval={{ id: "demo" }} state="approval-requested">
    <ConfirmationRequest>
      <ConfirmationTitle>
        Allow shell command?
        <BashCommandBlock command="ls -la /Users/jay/Workspace" />
      </ConfirmationTitle>
    </ConfirmationRequest>
    <ConfirmationActions>
      <ConfirmationAction variant="outline">Deny</ConfirmationAction>
      <ConfirmationAction>Allow once</ConfirmationAction>
    </ConfirmationActions>
  </Confirmation>
);

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <div style={{ maxWidth: 480 }}>
          <Sample />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <div style={{ maxWidth: 480 }}>
          <Sample />
        </div>
      </div>
    </div>
  ),
};
