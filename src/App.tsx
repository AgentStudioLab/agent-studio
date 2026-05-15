import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchSidecar, subscribeSSE } from "@/lib/sidecar-client";

function App() {
  const [health, setHealth] = useState<string>("(not checked)");
  const [ticks, setTicks] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  async function checkHealth() {
    try {
      const res = await fetchSidecar("/health");
      setHealth(`${res.status} ${await res.text()}`);
    } catch (err) {
      setHealth(`error: ${err}`);
    }
  }

  function toggleSSE() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTicks([]);
    subscribeSSE("/sse/ticks", (e) => {
      setTicks((prev) => [...prev.slice(-9), `${e.type}: ${e.data}`]);
    }, ctrl.signal).catch(() => {});
  }

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground p-8">
      <h1 className="text-3xl font-semibold">Agent Studio</h1>
      <div className="flex gap-3">
        <Button onClick={checkHealth}>Check /health</Button>
        <Button variant="outline" onClick={toggleSSE}>
          {abortRef.current ? "Stop SSE" : "Start SSE"}
        </Button>
      </div>
      <pre className="rounded-md border bg-muted px-4 py-2 text-sm">
        {health}
      </pre>
      {ticks.length > 0 && (
        <pre className="rounded-md border bg-muted px-4 py-2 text-sm w-72">
          {ticks.join("\n")}
        </pre>
      )}
    </main>
  );
}

export default App;
