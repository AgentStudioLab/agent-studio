import { ChevronDown, Hand } from "lucide-react";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

export function TaskMessageInput() {
  return (
    <div className="w-full">
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Write a message..." rows={2} />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton>
              <Hand className="size-4" />
              <span>Ask</span>
              <ChevronDown className="size-3" />
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputButton>
              <span>Legacy Model</span>
              <ChevronDown className="size-3" />
            </PromptInputButton>
            <PromptInputSubmit />
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
      <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
        Agent Studio is AI and can make mistakes. Please double-check responses.
      </p>
    </div>
  );
}
