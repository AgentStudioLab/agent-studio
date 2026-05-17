import { Star, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/features/_atoms/InitialsAvatar";
import type { MockPlugin } from "@/lib/mock/types";

interface PluginCardProps {
  plugin: MockPlugin;
  onInstall?: () => void;
  onUninstall?: () => void;
}

export function PluginCard({ plugin, onInstall, onUninstall }: PluginCardProps) {
  const installsLabel =
    plugin.installs >= 1000
      ? `${(plugin.installs / 1000).toFixed(1)}k`
      : plugin.installs.toString();

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <InitialsAvatar initials={plugin.initials} hue={plugin.hue} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">
            {plugin.name}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            by {plugin.author}
          </p>
        </div>
      </header>
      <p className="line-clamp-3 text-xs text-foreground">{plugin.description}</p>
      <footer className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Star
              className="size-3 fill-current"
              style={{ color: "hsl(var(--warning-100))" }}
            />
            {plugin.rating.toFixed(1)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Download className="size-3" />
            {installsLabel} installs
          </span>
        </div>
        <button
          type="button"
          onClick={plugin.installed ? onUninstall : onInstall}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            plugin.installed
              ? "border border-border bg-card text-foreground hover:bg-muted"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {plugin.installed && <Check className="size-3" />}
          {plugin.installed ? "Installed" : "Install"}
        </button>
      </footer>
    </article>
  );
}
