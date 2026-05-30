import { cn } from "@/lib/utils";

interface InitialsAvatarProps {
  initials: string;
  className?: string;
  size?: number;
  /** Hue from the primitives palette: orange/blue/purple/red/green/amber/stone */
  hue?: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
  /**
   * Corner style. `square` (default) is the entity-icon look for
   * skills/plugins/agents; `round` is the user-identity look (sidebar UserBar
   * + settings profile), matching Claude's neutral circular avatar.
   */
  shape?: "square" | "round";
  /**
   * Fill treatment. `solid` (default) = `hue` background + white initials, the
   * entity-icon look. `subtle` = a faint translucent neutral fill (composited
   * over whatever surface it sits on, so it blends with the sidebar/page bg)
   * + muted initials, so a user avatar reads as quiet chrome, not a colored
   * badge. `subtle` ignores `hue`.
   */
  tone?: "solid" | "subtle";
}

const hueBgVar: Record<NonNullable<InitialsAvatarProps["hue"]>, string> = {
  orange: "--color-orange-500",
  blue: "--color-blue-600",
  purple: "--color-purple-500",
  red: "--color-red-500",
  green: "--color-green-700",
  amber: "--color-amber-600",
  stone: "--color-stone-500",
};

export function InitialsAvatar({
  initials,
  className,
  size = 32,
  hue = "stone",
  shape = "square",
  tone = "solid",
}: InitialsAvatarProps) {
  const subtle = tone === "subtle";
  return (
    <div
      className={cn(
        "flex items-center justify-center font-medium",
        subtle ? "text-[hsl(var(--text-300))]" : "text-[hsl(var(--oncolor-100))]",
        shape === "round" ? "rounded-full" : "rounded-sm",
        className,
      )}
      style={{
        width: size,
        height: size,
        // subtle: faint neutral overlay → composites over the surface so the
        // circle tracks the sidebar/page bg instead of reading as a badge.
        background: subtle
          ? "hsl(var(--text-400) / 0.16)"
          : `hsl(var(${hueBgVar[hue]}))`,
        fontSize: size * 0.4,
      }}
      role="img"
      aria-label={initials}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}
