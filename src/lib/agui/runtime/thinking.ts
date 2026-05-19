// "线路安静"检测器。
// 当 run 在跑、但超过 ~600ms 没有任何事件到达时，把 isThinking 翻成 true。
// 这一段 UI 用来显示 shimmer 文案（"思考中…"）。
//
// 任何事件到达都重置定时器。run 结束时显式 clear。
//
// 抽离成独立类是为了：
//   1. reducer 保持纯，副作用（setTimeout）不混进 reducer
//   2. 单测时可以注入 fake timer

const DEFAULT_QUIET_THRESHOLD_MS = 600;

export interface ThinkingTimerOptions {
  /** 沉默多久算"思考中"。默认 600ms。 */
  thresholdMs?: number;
  /** 状态变化时回调。consumer 用它去更新 ChatState。 */
  onChange: (isThinking: boolean) => void;
}

export class ThinkingTimer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private thinking = false;
  private readonly thresholdMs: number;
  private readonly onChange: (v: boolean) => void;

  constructor(opts: ThinkingTimerOptions) {
    this.thresholdMs = opts.thresholdMs ?? DEFAULT_QUIET_THRESHOLD_MS;
    this.onChange = opts.onChange;
  }

  /** 标记 run 开始 / 已经在跑 —— 启动定时器。 */
  setRunning(running: boolean): void {
    this.running = running;
    if (!running) {
      this.clear();
    } else {
      this.ping();
    }
  }

  /**
   * 收到任何事件时调用：先把 thinking 翻 false，再 arm 一个新定时器。
   * 如果 run 已停止则不再 arm。
   */
  ping(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.thinking) {
      this.thinking = false;
      this.onChange(false);
    }
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.running && !this.thinking) {
        this.thinking = true;
        this.onChange(true);
      }
    }, this.thresholdMs);
  }

  /** 立即清除定时器并把 thinking 翻 false。 */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.thinking) {
      this.thinking = false;
      this.onChange(false);
    }
  }

  /** 销毁时调用，避免泄漏定时器。 */
  destroy(): void {
    this.clear();
    this.running = false;
  }
}
