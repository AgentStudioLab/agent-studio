import { cn } from "@/lib/utils";

interface BrandStarProps {
  className?: string;
  spinning?: boolean;
  size?: number;
}

export function BrandStar({ className, spinning = false, size = 16 }: BrandStarProps) {
  return (
    <img
      src="/logo/logo.png"
      width={size}
      height={size}
      className={cn(spinning && "animate-spin-slow", className)}
      alt="Agent Studio brand mark"
      draggable={false}
    />
  );
}
