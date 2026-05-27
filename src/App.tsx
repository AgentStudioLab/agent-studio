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
            <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
              <MacTitlebar />
              <div className="flex min-h-0 flex-1">
                <RouterView />
              </div>
            </div>
          </TooltipProvider>
        </MessageQueueProvider>
      </AppShellProvider>
    </HashRouter>
  );
}

export default App;
