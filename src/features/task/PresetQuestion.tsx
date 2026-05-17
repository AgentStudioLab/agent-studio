interface PresetQuestionProps {
  q: string;
  a?: string;
}

/**
 * Two-line preset Q+A card (prototype Showcase 1 lines 876-881).
 * Q in serif; A in text-300.
 */
export function PresetQuestion({ q, a }: PresetQuestionProps) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: "hsl(var(--bg-200) / 0.6)",
        border: "1px solid hsl(var(--border-300) / 0.1)",
      }}
    >
      <div
        className="font-serif text-[15.5px] font-medium leading-snug"
        style={{ color: "hsl(var(--text-100))" }}
      >
        {q}
      </div>
      {a && (
        <div
          className="mt-1 text-[13.5px]"
          style={{ color: "hsl(var(--text-300))" }}
        >
          {a}
        </div>
      )}
    </div>
  );
}
