import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRenameConversationMutation } from "@/lib/data/queries";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  currentTitle: string;
}

/**
 * Rename a conversation. Shared across the sidebar item menu, the task header
 * menu, and the Tasks page. Self-contained: owns the mutation so callers only
 * pass which conversation + its current title and toggle `open`.
 */
export function RenameDialog({
  open,
  onOpenChange,
  conversationId,
  currentTitle,
}: RenameDialogProps) {
  const { t } = useTranslation();
  const rename = useRenameConversationMutation();
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-seed the field with the live title each time the dialog opens.
  useEffect(() => {
    if (open) setValue(currentTitle);
  }, [open, currentTitle]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && conversationId !== null;

  const handleSave = () => {
    if (!canSave || !conversationId) return;
    if (trimmed !== currentTitle) {
      rename.mutate({ id: conversationId, title: trimmed });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          // Focus + pre-select the title so the user can overwrite immediately.
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("task.renameDialog.title")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={t("task.renameDialog.title")}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("task.renameDialog.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t("task.renameDialog.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
