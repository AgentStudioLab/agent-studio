import { useId } from "react";
import { cn } from "@/lib/utils";

interface BrandStarProps {
  className?: string;
  spinning?: boolean;
  size?: number;
}

export function BrandStar({ className, spinning = false, size = 16 }: BrandStarProps) {
  const gradientId = `agent-studio-brand-${useId().replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      className={cn(spinning && "animate-spin-slow", className)}
      role="img"
      aria-label="Agent Studio brand mark"
      fill="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="13" y1="5" x2="67" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="hsl(var(--brand-100))" />
          <stop offset="1" stopColor="hsl(var(--accent-100))" />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="16" fill={`url(#${gradientId})`} />
      <path
        d="M27.8 52.8L40 27.2"
        fill="none"
        stroke="white"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M52.2 52.8L40 27.2"
        fill="none"
        stroke="white"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="27.2" r="2.2" fill="white" />
      <path d="M32.8 42.2H47.2" fill="none" stroke="white" strokeWidth="3.3" strokeLinecap="round" />
      <path d="M18.1 27.5L9.1 40L18.1 52.5" fill="none" stroke="white" strokeWidth="4.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M61.9 27.5L70.9 40L61.9 52.5" fill="none" stroke="white" strokeWidth="4.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.8" cy="42.5" r="2.1" fill="white" />
      <circle cx="57.2" cy="42.5" r="2.1" fill="white" />
    </svg>
  );
}
