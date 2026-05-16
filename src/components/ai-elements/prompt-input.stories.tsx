import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlusIcon, MicIcon } from "lucide-react";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { TooltipProvider } from "@/components/ui/tooltip";

const meta: Meta<typeof PromptInput> = {
  title: "AI Elements/PromptInput",
  component: PromptInput,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PromptInput>;

export const NewTask: Story = {
  render: () => (
    <div style={{ maxWidth: "640px" }}>
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="How can I help you today?" />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton aria-label="Attach">
              <PlusIcon className="size-4" />
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputButton aria-label="Voice">
              <MicIcon className="size-4" />
            </PromptInputButton>
            <PromptInputSubmit />
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
};

export const TaskInProgress: Story = {
  render: () => (
    <div style={{ maxWidth: "640px" }}>
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Write a message..." />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton aria-label="Attach">
              <PlusIcon className="size-4" />
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputButton aria-label="Voice">
              <MicIcon className="size-4" />
            </PromptInputButton>
            <PromptInputSubmit />
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <PromptInput onSubmit={() => {}}>
          <PromptInputTextarea placeholder="Write a message..." />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton aria-label="Attach">
                <PlusIcon className="size-4" />
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <PromptInput onSubmit={() => {}}>
          <PromptInputTextarea placeholder="Write a message..." />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputButton aria-label="Attach">
                <PlusIcon className="size-4" />
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  ),
};
