import { cn } from "@/lib/utils";

interface InitialsAvatarProps {
  initials: string;
  className?: string;
  size?: number;
  /** Hue from the primitives palette: orange/blue/purple/red/green/amber/stone */
  hue?: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
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

export function InitialsAvatar({ initials, className, size = 32, hue = "stone" }: InitialsAvatarProps) {
  return (
    <div
      className={cn("flex items-center justify-center font-medium text-[hsl(var(--oncolor-100))] rounded-sm", className)}
      style={{
        width: size,
        height: size,
        background: `hsl(var(${hueBgVar[hue]}))`,
        fontSize: size * 0.4,
      }}
      role="img"
      aria-label={initials}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}
