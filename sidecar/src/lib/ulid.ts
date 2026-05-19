const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = 0;
let lastRandom: number[] = [];

function encodeTime(now: number): string {
  let out = "";
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function incRandom(rand: number[]): number[] {
  const next = [...rand];
  for (let i = RANDOM_LEN - 1; i >= 0; i--) {
    if (next[i]! < 31) {
      next[i] = next[i]! + 1;
      return next;
    }
    next[i] = 0;
  }
  return next;
}

function newRandom(): number[] {
  const out = new Array<number>(RANDOM_LEN);
  for (let i = 0; i < RANDOM_LEN; i++) out[i] = Math.floor(Math.random() * 32);
  return out;
}

function encodeRandom(rand: number[]): string {
  let out = "";
  for (const v of rand) out += ENCODING[v];
  return out;
}

export function ulid(): string {
  const now = Date.now();
  if (now === lastTime) {
    lastRandom = incRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = newRandom();
  }
  return encodeTime(now) + encodeRandom(lastRandom);
}
