import { ChevronDown, ExternalLink, FolderOpen, Hand } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { BrandStar } from "@/shared/atoms/BrandStar";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

export function NewTaskView() {
  return (
    <AppShell
      main={
        <div className="flex h-full items-center justify-center px-6 py-12">
          <div className="flex w-full max-w-2xl flex-col items-center gap-6 text-center">
            <BrandStar size={48} />
            <h1 className="font-serif text-4xl font-semibold leading-tight text-foreground">
              Let's knock something off your list
            </h1>
            <a
              href="#"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Learn how to use Agent Studio safely.
              <ExternalLink className="size-3" />
            </a>
            <div className="w-full text-left">
              <PromptInput onSubmit={() => {}}>
                <PromptInputTextarea placeholder="How can I help you today?" />
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputButton>
                      <FolderOpen className="size-4" />
                      <span>Work in a project</span>
                      <ChevronDown className="size-3" />
                    </PromptInputButton>
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
            </div>
          </div>
        </div>
      }
    />
  );
}
