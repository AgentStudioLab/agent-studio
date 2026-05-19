"use client";

import { cn } from "@/lib/utils";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type CSSProperties,
} from "react";

export interface SpriteState {
  /** Full sprite-sheet SVG string (including outer <svg> tag). */
  svg: string;
  /** Single-frame width in viewBox units. */
  width: number;
  /** Single-frame height in viewBox units. */
  height: number;
  /** Number of frames stacked vertically inside the sprite. */
  frameCount: number;
  /** Per-frame dwell time in milliseconds. */
  speed: number;
}

export interface SpriteLoaderProps
  extends Omit<ComponentProps<"div">, "color" | "children"> {
  /** Active state key (looked up in `states`). */
  state: string;
  /** Map of state-key → sprite spec. */
  states: Record<string, SpriteState>;
  /** Render size in CSS pixels (square). Defaults to single-frame width. */
  size?: number;
  /** Color override. Default `currentColor` — inherits parent text color. */
  color?: string;
  /** Loop the animation. Default true. Set false for one-shot reactions. */
  loop?: boolean;
  /** Called when a non-looping animation finishes. */
  onFinish?: () => void;
  /** Screen-reader label. */
  label?: string;
}

export const SpriteLoader = ({
  state,
  states,
  size,
  color,
  loop = true,
  onFinish,
  label = "Loading",
  className,
  style,
  ...rest
}: SpriteLoaderProps) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const spec = states[state];

  useEffect(() => {
    const node = innerRef.current;
    if (!spec || !node) return;
    const { frameCount, speed } = spec;

    const keyframes = Array.from({ length: frameCount }, (_, i) => ({
      transform: `translateY(-${(i * 100) / frameCount}%)`,
    }));

    const animation = node.animate(keyframes, {
      duration: speed * frameCount,
      iterations: loop ? Number.POSITIVE_INFINITY : 1,
      easing: `steps(${frameCount}, jump-none)`,
    });

    if (loop && typeof window !== "undefined") {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (reduced) animation.playbackRate = 0.25;
    }

    let finishHandler: (() => void) | undefined;
    if (!loop && onFinish) {
      finishHandler = onFinish;
      animation.addEventListener("finish", finishHandler);
    }

    return () => {
      if (finishHandler)
        animation.removeEventListener("finish", finishHandler);
      animation.cancel();
    };
  }, [spec, state, loop, onFinish]);

  if (!spec) return null;

  const renderSize = size ?? spec.width;

  const wrapperStyle: CSSProperties = {
    width: renderSize,
    height: renderSize,
    aspectRatio: spec.width / spec.height,
    ...(color ? { color } : null),
    ...style,
  };

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "relative inline-block overflow-hidden select-none",
        className
      )}
      style={wrapperStyle}
      {...rest}
    >
      <div
        ref={innerRef}
        className="sprite-loader-inner w-full will-change-transform"
        dangerouslySetInnerHTML={{ __html: spec.svg }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
};
