import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateAgentLinkMutation } from "@/lib/data/agent-link-queries";

const INPUT_CLASS =
  "w-full rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30";
const LABEL_CLASS = "mb-1.5 block text-[13px] text-text-200";

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function AddLinkModal({
  agentId,
  open,
  onOpenChange,
}: {
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAgentLinkMutation(agentId);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open) {
      setUrl("");
      setTitle("");
    }
  }, [open]);

  const valid = isHttpUrl(url);
  const showError = url.trim().length > 0 && !valid;

  const handleAdd = () => {
    if (!valid) return;
    create.mutate({ url: url.trim(), title: title.trim() || undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[480px]">
        <DialogHeader className="mb-6">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {t("agentSpace.addLinkModal.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="mb-4">
          <label htmlFor="link-url" className={LABEL_CLASS}>
            URL
          </label>
          <input
            id="link-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t("agentSpace.addLinkModal.urlPlaceholder")}
            className={INPUT_CLASS}
            autoFocus
          />
          {showError && (
            <p className="mt-1.5 text-[12px] text-danger-100">
              {t("agentSpace.addLinkModal.invalidUrl")}
            </p>
          )}
        </div>
        <div className="mb-2">
          <label htmlFor="link-title" className={LABEL_CLASS}>
            {t("agentSpace.addLinkModal.titleLabel")}
          </label>
          <input
            id="link-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={t("agentSpace.addLinkModal.titlePlaceholder")}
            className={INPUT_CLASS}
          />
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-[13.5px] text-text-200 transition hover:bg-bg-200"
          >
            {t("agentSpace.addLinkModal.cancel")}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!valid}
            className="rounded-md bg-text-100 px-4 py-2 text-[13.5px] font-medium text-bg-100 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("agentSpace.addLinkModal.add")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
