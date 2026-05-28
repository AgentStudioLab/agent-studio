import { useTranslation } from "react-i18next";
import { ArrowRight, Leaf } from "lucide-react";

interface UpdateCardProps {
  version: string;
  onClick?: () => void;
}

export function UpdateCard({ version, onClick }: UpdateCardProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-state-hover"
      style={{ border: "1px solid hsl(var(--border-300) / 0.15)" }}
    >
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-md"
        style={{
          background: "hsl(var(--success-100) / 0.12)",
          color: "hsl(var(--success-100))",
        }}
      >
        <Leaf className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium leading-tight text-foreground">
          {t("sidebar.update.title")}
        </div>
        <div className="mt-0.5 font-mono text-[11px] leading-tight text-muted-foreground">
          {version}
        </div>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  );
}
