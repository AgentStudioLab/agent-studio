import type { ReactNode } from "react";

interface UserMessageProps {
  children: ReactNode;
}

/**
 * Right-aligned bubble for user messages. Bubble surface is `--bg-300`
 * (matches prototype Showcase 1 lines 790-797).
 */
export function UserMessage({ children }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[78%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed"
        style={{
          background: "hsl(var(--bg-300))",
          color: "hsl(var(--text-100))",
        }}
      >
        {children}
      </div>
    </div>
  );
}
