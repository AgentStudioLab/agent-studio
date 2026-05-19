import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState } from "react";
import {
  SpriteLoader,
  type SpriteState,
} from "@/components/ai-elements/sprite-loader";

/* -------------------------------------------------------------------------- */
/* Placeholder sprite generators.                                             */
/* These are abstract, brand-neutral demos (§3.2 of the implementation doc).  */
/* Real sprite-mark assets are copyrighted and should be supplied by the      */
/* consumer — these only prove the player works with vertically-stacked      */
/* sprite-sheet SVGs.                                                         */
/* -------------------------------------------------------------------------- */

const FRAME = 100;

function buildBreathingSprite(): SpriteState {
  const N = 8;
  let body = "";
  for (let f = 0; f < N; f++) {
    const t = f / N;
    const scale = 0.55 + 0.45 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    const cy = f * FRAME + FRAME / 2;
    const r = (FRAME * 0.32 * scale).toFixed(2);
    body += `<circle cx="${FRAME / 2}" cy="${cy}" r="${r}" fill="currentColor" opacity="0.85"/>`;
  }
  return {
    svg: `<svg viewBox="0 0 ${FRAME} ${N * FRAME}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
    width: FRAME,
    height: FRAME,
    frameCount: N,
    speed: 130,
  };
}

function buildChaseSprite(): SpriteState {
  const N = 12;
  const cx = FRAME / 2;
  const innerR = FRAME * 0.26;
  const outerR = FRAME * 0.46;
  let body = "";
  for (let f = 0; f < N; f++) {
    const cy = f * FRAME + FRAME / 2;
    for (let i = 0; i < N; i++) {
      const angle = ((i * 360) / N - 90) * (Math.PI / 180);
      const x1 = (cx + innerR * Math.cos(angle)).toFixed(2);
      const y1 = (cy + innerR * Math.sin(angle)).toFixed(2);
      const x2 = (cx + outerR * Math.cos(angle)).toFixed(2);
      const y2 = (cy + outerR * Math.sin(angle)).toFixed(2);
      const opacity = ((((i - f + N) % N) + 1) / N).toFixed(3);
      body += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="${opacity}"/>`;
    }
  }
  return {
    svg: `<svg viewBox="0 0 ${FRAME} ${N * FRAME}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
    width: FRAME,
    height: FRAME,
    frameCount: N,
    speed: 80,
  };
}

function buildBurstSprite(): SpriteState {
  const scales = [0.2, 0.7, 1.15, 1.05, 0.65, 0.3];
  const N = scales.length;
  let body = "";
  for (let f = 0; f < N; f++) {
    const cy = f * FRAME + FRAME / 2;
    const r = (FRAME * 0.32 * scales[f]).toFixed(2);
    body += `<circle cx="${FRAME / 2}" cy="${cy}" r="${r}" fill="currentColor"/>`;
  }
  return {
    svg: `<svg viewBox="0 0 ${FRAME} ${N * FRAME}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
    width: FRAME,
    height: FRAME,
    frameCount: N,
    speed: 65,
  };
}

const DEMO_STATES = {
  breathing: buildBreathingSprite(),
  chase: buildChaseSprite(),
  burst: buildBurstSprite(),
};

/* -------------------------------------------------------------------------- */

const meta: Meta<typeof SpriteLoader> = {
  title: "AI Elements/SpriteLoader",
  component: SpriteLoader,
  parameters: { layout: "centered" },
  args: {
    states: DEMO_STATES,
    state: "breathing",
    size: 64,
  },
  argTypes: {
    state: {
      control: { type: "select" },
      options: Object.keys(DEMO_STATES),
    },
    size: { control: { type: "number", min: 16, max: 160, step: 4 } },
    loop: { control: { type: "boolean" } },
  },
};
export default meta;
type Story = StoryObj<typeof SpriteLoader>;

export const Breathing: Story = {
  args: { state: "breathing" },
  render: (args) => (
    <div className="text-primary">
      <SpriteLoader {...args} />
    </div>
  ),
};

export const Chase: Story = {
  args: { state: "chase" },
  render: (args) => (
    <div className="text-primary">
      <SpriteLoader {...args} />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6 text-primary">
      {[24, 32, 48, 64, 96].map((s) => (
        <SpriteLoader
          key={s}
          state="breathing"
          states={DEMO_STATES}
          size={s}
        />
      ))}
    </div>
  ),
};

export const InheritsTextColor: Story = {
  render: () => (
    <div className="flex items-center gap-8">
      {[
        { cls: "text-primary", label: "text-primary" },
        { cls: "text-foreground", label: "text-foreground" },
        { cls: "text-muted-foreground", label: "text-muted-foreground" },
        { cls: "text-destructive", label: "text-destructive" },
      ].map((v) => (
        <div
          key={v.label}
          className={`flex flex-col items-center gap-2 ${v.cls}`}
        >
          <SpriteLoader state="chase" states={DEMO_STATES} size={48} />
          <span className="text-muted-foreground text-xs">{v.label}</span>
        </div>
      ))}
    </div>
  ),
};

export const OneShotBurst: Story = {
  name: "One-shot (loop=false + onFinish)",
  render: () => {
    const [count, setCount] = useState(0);
    const [nonce, setNonce] = useState(0);
    const replay = useCallback(() => setNonce((n) => n + 1), []);
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="text-primary" key={nonce}>
          <SpriteLoader
            state="burst"
            states={DEMO_STATES}
            size={64}
            loop={false}
            onFinish={() => setCount((c) => c + 1)}
          />
        </div>
        <button
          type="button"
          onClick={replay}
          className="rounded-md border bg-background px-3 py-1.5 text-foreground text-sm hover:bg-muted"
        >
          Replay
        </button>
        <span className="text-muted-foreground text-xs">
          finished {count} {count === 1 ? "time" : "times"}
        </span>
      </div>
    );
  },
};

export const StateMachine: Story = {
  name: "State machine (idle ↔ working ↔ burst)",
  render: () => {
    const [state, setState] = useState<keyof typeof DEMO_STATES>("breathing");
    const [prev, setPrev] = useState<keyof typeof DEMO_STATES>("breathing");

    const trigger = useCallback(() => {
      if (state === "burst") return;
      setPrev(state);
      setState("burst");
    }, [state]);

    return (
      <div className="flex flex-col items-center gap-4">
        <div
          className="text-primary cursor-pointer"
          onMouseDown={trigger}
          role="button"
          aria-label="Tickle the loader"
        >
          <SpriteLoader
            state={state}
            states={DEMO_STATES}
            size={72}
            loop={state !== "burst"}
            onFinish={() => state === "burst" && setState(prev)}
          />
        </div>

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setState("breathing")}
            className={`rounded-md px-3 py-1.5 ${
              state === "breathing"
                ? "bg-primary text-primary-foreground"
                : "border bg-background text-foreground hover:bg-muted"
            }`}
          >
            breathing
          </button>
          <button
            type="button"
            onClick={() => setState("chase")}
            className={`rounded-md px-3 py-1.5 ${
              state === "chase"
                ? "bg-primary text-primary-foreground"
                : "border bg-background text-foreground hover:bg-muted"
            }`}
          >
            chase
          </button>
          <button
            type="button"
            onClick={trigger}
            className="rounded-md border bg-background px-3 py-1.5 text-foreground hover:bg-muted"
          >
            burst once
          </button>
        </div>

        <span className="text-muted-foreground text-xs">
          state: <code className="font-mono">{state}</code> · click the loader
          to tickle
        </span>
      </div>
    );
  },
};

export const InCard: Story = {
  render: () => (
    <div className="flex w-80 flex-col items-center gap-3 rounded-lg border bg-card p-6">
      <div className="text-primary">
        <SpriteLoader state="chase" states={DEMO_STATES} size={48} />
      </div>
      <div className="text-foreground text-sm">Reading file tree…</div>
      <div className="text-muted-foreground text-xs">
        Scanning ~/Workspace for old projects
      </div>
    </div>
  ),
};

export const SideBySide: Story = {
  name: "Light / Dark",
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div
        className="text-primary"
        style={{
          background: "hsl(var(--bg-100))",
          padding: "1.5rem",
          borderRadius: "var(--radius-card)",
        }}
      >
        <SpriteLoader state="breathing" states={DEMO_STATES} size={56} />
      </div>
      <div
        data-mode="dark"
        className="text-primary"
        style={{
          background: "hsl(var(--bg-100))",
          padding: "1.5rem",
          borderRadius: "var(--radius-card)",
        }}
      >
        <SpriteLoader state="breathing" states={DEMO_STATES} size={56} />
      </div>
    </div>
  ),
};
