import { cn } from "@/lib/utils";

interface BrandStarProps {
  className?: string;
  spinning?: boolean;
  size?: number;
}

export function BrandStar({ className, spinning = false, size = 16 }: BrandStarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="hsl(var(--brand-100))"
      className={cn(spinning && "animate-spin-slow", className)}
      role="img"
      aria-label="Agent Studio brand mark"
    >
      {/* 8-point Anthropic star path */}
      <path d="M12 0L13.4 8.5L20.5 3.5L15.5 10.6L24 12L15.5 13.4L20.5 20.5L13.4 15.5L12 24L10.6 15.5L3.5 20.5L8.5 13.4L0 12L8.5 10.6L3.5 3.5L10.6 8.5L12 0Z" />
    </svg>
  );
}
