import { useAppShell } from "@/app/AppShellContext";

const TRAFFIC_LIGHT_SLOT = 80; // px reserved for native macOS traffic lights

export function MacTitlebar() {
  const { hideSidebar } = useAppShell();
  return (
    <div
      data-tauri-drag-region
      className="relative flex h-9 shrink-0 select-none items-center"
      style={{
        paddingLeft: TRAFFIC_LIGHT_SLOT,
        background:
          "linear-gradient(to bottom, hsl(var(--chrome-bg-top)), hsl(var(--chrome-bg-bottom)))",
        borderBottom: "0.5px solid hsl(var(--border-300) / 0.25)",
      }}
    >
      {!hideSidebar && (
        <div
          className="pointer-events-none absolute inset-x-0 text-center text-[13px] font-medium"
          style={{ color: "hsl(var(--text-300))" }}
        >
          Agent Studio
        </div>
      )}
    </div>
  );
}
