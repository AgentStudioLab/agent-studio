import {
  FileSpreadsheet,
  FileText,
  Presentation,
  FileCode,
  File as FileIcon,
  ChevronRight,
} from "lucide-react";
import type { ToolUIPart } from "ai";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import type { Artifact, ChatMessage, ToolCall } from "@/lib/mock/types";

const TYPE_ICON = {
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  document: FileText,
  markdown: FileText,
  code: FileCode,
} as const;

const TOOL_TYPE_MAP: Record<ToolCall["type"], ToolUIPart["type"]> = {
  bash: "tool-bash",
  "fs-read": "tool-fs-read",
  "fs-write": "tool-fs-write",
  "web-search": "tool-web-search",
  search: "tool-search",
};

interface ArtifactChipProps {
  artifact: Artifact;
  onClick?: () => void;
}

export function ArtifactChip({ artifact, onClick }: ArtifactChipProps) {
  const Icon = TYPE_ICON[artifact.type] ?? FileIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border bg-card px-2.5 py-1.5 text-sm text-foreground transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      )}
    >
      <Icon className="size-4 text-muted-foreground" />
      <span className="font-medium">{artifact.name}</span>
      {artifact.opener && (
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <ChevronRight className="size-3" />
          {artifact.opener}
        </span>
      )}
    </button>
  );
}

interface TaskChatStreamProps {
  messages: ChatMessage[];
  onOpenArtifact?: (artifact: Artifact) => void;
}

export function TaskChatStream({
  messages,
  onOpenArtifact,
}: TaskChatStreamProps) {
  return (
    <div className="flex flex-col gap-6 px-6 py-4">
      {messages.map((m) => (
        <Message key={m.id} from={m.from}>
          <MessageContent>
            {m.content && <p>{m.content}</p>}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {m.toolCalls.map((tc) => (
                  <Tool
                    key={tc.id}
                    defaultOpen={tc.state === "output-available"}
                  >
                    <ToolHeader
                      type={TOOL_TYPE_MAP[tc.type]}
                      state={tc.state as ToolUIPart["state"]}
                    />
                    <ToolContent>
                      <ToolInput input={tc.input} />
                      <ToolOutput
                        output={tc.output}
                        errorText={tc.errorText}
                      />
                    </ToolContent>
                  </Tool>
                ))}
              </div>
            )}
            {m.artifacts && m.artifacts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.artifacts.map((a) => (
                  <ArtifactChip
                    key={a.id}
                    artifact={a}
                    onClick={() => onOpenArtifact?.(a)}
                  />
                ))}
              </div>
            )}
          </MessageContent>
        </Message>
      ))}
    </div>
  );
}
