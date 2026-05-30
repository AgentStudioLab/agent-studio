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
    >
      <defs>
        <linearGradient id={gradientId} x1="13" y1="5" x2="67" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c45a43" />
          <stop offset="1" stopColor="#a93d4d" />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="16" fill={`url(#${gradientId})`} />
      <path
        d="M25 61.6L40 16.9"
        stroke="white"
        strokeWidth="5.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M55 61.6L40 16.9"
        stroke="white"
        strokeWidth="5.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="40" cy="16.9" r="2.5" fill="white" />
      <path d="M30.6 44.1H49.4" stroke="white" strokeWidth="4.1" strokeLinecap="round" />
      <path d="M17.8 31.3L10 40L17.8 48.8" stroke="white" strokeWidth="4.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M62.2 31.3L70 40L62.2 48.8" stroke="white" strokeWidth="4.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22.5" cy="42.5" r="2.2" fill="white" />
      <circle cx="57.5" cy="42.5" r="2.2" fill="white" />
    </svg>
  );
}
