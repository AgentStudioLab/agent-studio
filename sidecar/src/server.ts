import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

type Args = { port: number; token: string };

function parseArgs(argv: string[]): Args {
  const get = (key: string) => {
    const prefix = `--${key}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit?.slice(prefix.length);
  };
  const portStr = get("port");
  const token = get("token");
  if (!portStr || !token) {
    console.error("usage: server --port=<n> --token=<s>");
    process.exit(2);
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`invalid port: ${portStr}`);
    process.exit(2);
  }
  return { port, token };
}

const { port, token } = parseArgs(process.argv.slice(2));

const app = new Hono();

app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.get("/health", (c) => c.json({ ok: true, pid: process.pid }));

app.get("/echo/:msg", (c) => c.json({ msg: c.req.param("msg") }));

app.get("/sse/ticks", (c) =>
  streamSSE(c, async (stream) => {
    let i = 0;
    while (!stream.aborted) {
      await stream.writeSSE({ event: "tick", data: String(i++) });
      await stream.sleep(1000);
    }
  }),
);

console.log(`[sidecar] listening on http://127.0.0.1:${port}`);

export default {
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
