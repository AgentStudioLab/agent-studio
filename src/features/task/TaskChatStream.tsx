import { BrandStar } from "@/shared/atoms/BrandStar";
import { ArtifactInlineCard } from "@/features/task/ArtifactInlineCard";
import { MessageActions } from "@/features/task/MessageActions";
import { PresetQuestion } from "@/features/task/PresetQuestion";
import { ToolCallTimeline } from "@/features/task/ToolCallTimeline";
import { UserMessage } from "@/features/task/UserMessage";
import type {
  Artifact,
  ChatMessage,
  ContentBlock,
} from "@/lib/mock/types";

interface TaskChatStreamProps {
  messages: ChatMessage[];
  onOpenArtifact?: (artifact: Artifact) => void;
}

/* ------------------ block dispatcher ------------------ */
function Block({
  block,
  onOpenArtifact,
}: {
  block: ContentBlock;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <div
          className="text-[14px] leading-[1.75]"
          style={{ color: "hsl(var(--text-100))" }}
        >
          {block.text}
        </div>
      );

    case "preset-question":
      return <PresetQuestion q={block.q} a={block.a} />;

    case "tool-call-timeline":
      return (
        <ToolCallTimeline
          summary={block.summary}
          steps={block.steps}
          defaultOpen={block.defaultOpen}
        />
      );

    case "prose":
      // Prose paragraphs / lists with inline HTML. The fixture builds these
      // strings so list markers / strong tags / link colors can be expressed
      // without inventing yet more block types.
      return (
        <div
          className="prose-stream space-y-3 text-[14px] leading-[1.75]"
          style={{ color: "hsl(var(--text-100))" }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );

    case "artifact":
      return (
        <ArtifactInlineCard
          title={block.name}
          kind={block.kind}
          ext={block.ext}
          opener={block.opener}
          onOpen={() =>
            onOpenArtifact?.({
              id: block.name,
              name: block.name,
              type:
                block.kind === "Spreadsheet"
                  ? "spreadsheet"
                  : block.kind === "Presentation"
                    ? "presentation"
                    : "document",
              opener: block.opener,
            })
          }
        />
      );

    case "message-actions":
      return <MessageActions />;

    case "brand-star":
      return (
        <div className="pt-4">
          <BrandStar size={block.size ?? 20} spinning={block.spin ?? true} />
        </div>
      );
  }
}

/* ------------------ legacy fallback (string content only) ------------------ */
function legacyBlocks(m: ChatMessage): ContentBlock[] {
  return m.content ? [{ type: "text", text: m.content }] : [];
}

export function TaskChatStream({
  messages,
  onOpenArtifact,
}: TaskChatStreamProps) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((m) => {
        const blocks = m.blocks ?? legacyBlocks(m);

        if (m.from === "user") {
          // User messages render as a single bubble. If a user message ever
          // carried multi-block content, only the first text block is shown.
          const first = blocks.find((b) => b.type === "text");
          const text = first && first.type === "text" ? first.text : "";
          return <UserMessage key={m.id}>{text}</UserMessage>;
        }

        return (
          <div key={m.id} className="space-y-3">
            {blocks.map((block, i) => (
              <Block
                key={i}
                block={block}
                onOpenArtifact={onOpenArtifact}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
