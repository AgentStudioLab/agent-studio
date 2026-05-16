import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Canvas — generic preview/render container for HTML, images, slides, etc.
 *
 * ai-elements ships `canvas` as a ReactFlow node-graph editor; that mismatched
 * our use case (body of PreviewPane, PRD § 4.2), so we replaced the upstream
 * impl with a lightweight surface that wraps arbitrary children with the
 * card surface + alpha border + rounded-lg radius. Consumers add internal
 * padding as needed.
 */
export type CanvasProps = HTMLAttributes<HTMLDivElement>;

export const Canvas = ({ className, children, ...props }: CanvasProps) => (
  <div
    className={cn(
      "overflow-hidden rounded-lg border bg-card text-card-foreground",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
