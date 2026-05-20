import {
  SpriteLoader,
  type SpriteState,
} from "@/components/ai-elements/sprite-loader";

/**
 * Inline procedurally-generated chase sprite — the simplest visual that
 * matches the SpriteLoader's frame-stack expectation. 12 frames of dots
 * rotating around a circle. Stays brand-neutral (no Anthropic asset).
 */
const FRAME = 24;
const COUNT = 12;
function buildChaseSprite(): SpriteState {
  const cx = FRAME / 2;
  const innerR = FRAME * 0.28;
  const outerR = FRAME * 0.45;
  let body = "";
  for (let f = 0; f < COUNT; f++) {
    const cy = f * FRAME + FRAME / 2;
    for (let i = 0; i < COUNT; i++) {
      const angle = ((i * 360) / COUNT - 90) * (Math.PI / 180);
      const x1 = (cx + innerR * Math.cos(angle)).toFixed(2);
      const y1 = (cy + innerR * Math.sin(angle)).toFixed(2);
      const x2 = (cx + outerR * Math.cos(angle)).toFixed(2);
      const y2 = (cy + outerR * Math.sin(angle)).toFixed(2);
      const opacity = ((((i - f + COUNT) % COUNT) + 1) / COUNT).toFixed(3);
      body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="${opacity}"/>`;
    }
  }
  return {
    svg: `<svg viewBox="0 0 ${FRAME} ${COUNT * FRAME}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
    width: FRAME,
    height: FRAME,
    frameCount: COUNT,
    speed: 90,
  };
}

const STATES = { active: buildChaseSprite() };

/**
 * Thin wrapper around <SpriteLoader> with a chase sprite preset, color
 * inherits from parent text color. Used wherever the chat surface wants
 * to indicate "agent is working" while a run is live.
 */
export function ThinkingSpinner({ size = 16 }: { size?: number }) {
  return (
    <SpriteLoader state="active" states={STATES} size={size} label="thinking" />
  );
}
