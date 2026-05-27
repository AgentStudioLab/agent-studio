import { HashRouter } from "react-router-dom";
import { AppShellProvider } from "@/app/AppShellContext";
import { MessageQueueProvider } from "@/features/task/MessageQueueContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MacTitlebar } from "@/app/MacTitlebar";
import { RouterView } from "@/app/RouterView";

function App() {
  return (
    // HashRouter chosen for Tauri: works under the file:// (mac/win) and
    // tauri:// (Linux/Win, future) schemes without server-side rewrites.
    // The hash never reaches the network, so it's a no-op at sidecar level.
    <HashRouter>
      <AppShellProvider>
        <MessageQueueProvider>
          <TooltipProvider delayDuration={200}>
            {/* `rounded-xl` clips the app contents to a 12px radius so the
             *  inner surfaces (sidebar bg, canvas bg) follow the macOS native
             *  rounded window edge instead of showing a hard color step at
             *  the corners.
             *
             *  `bg-dot-grid` paints the breathing dot pattern as a fixed
             *  viewport-anchored ::before pseudo. Opaque children (sidebar,
             *  main, titlebar's left segment) cover it. Where children are
             *  transparent (titlebar's right segment), the dots show through
             *  — so the titlebar canvas area visually continues the same
             *  pattern as the main canvas below. */}
            <div className="relative h-screen w-screen overflow-hidden rounded-xl bg-background bg-dot-grid">
              {/* Content is rendered first so it occupies the full window.
               *  MacTitlebar sits above it as an absolute overlay (z-50) —
               *  view-level headers (TaskHeader, RightPanel tabs) now start
               *  at y=0 and visually use the titlebar strip instead of
               *  leaving a 36px gap. The overlay handles drag region + the
               *  sidebar/search controls; pointer-events are scoped inside
               *  it so the area NOT covered by those controls falls through
               *  to the view below. */}
              <div className="flex h-full w-full">
                <RouterView />
              </div>
              <MacTitlebar />
            </div>
          </TooltipProvider>
        </MessageQueueProvider>
      </AppShellProvider>
    </HashRouter>
  );
}

export default App;
