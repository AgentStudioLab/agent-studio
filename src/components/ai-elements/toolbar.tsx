import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Toolbar — horizontal row of icon actions under an agent message
 * (PRD § 4.2 `MessageActions`: Copy / ThumbsUp / ThumbsDown / Regenerate).
 *
 * ai-elements ships `toolbar` as a `NodeToolbar` wrapper from `@xyflow/react`
 * that floats over a ReactFlow node — wrong abstraction for a message footer.
 * Replaced with a lightweight flex row matching the Anthropic prototype:
 * 32x32 ghost icon buttons, gap-1, muted-foreground at rest, foreground on
 * hover. Mirrors the `canvas` replacement precedent.
 */
export type ToolbarProps = HTMLAttributes<HTMLDivElement>;

export const Toolbar = ({ className, ...props }: ToolbarProps) => (
  <div
    className={cn("flex items-center gap-1", className)}
    role="toolbar"
    {...props}
  />
);

export type ToolbarButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const ToolbarButton = ({
  className,
  type = "button",
  ...props
}: ToolbarButtonProps) => (
  <button
    type={type}
    className={cn(
      "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
);
