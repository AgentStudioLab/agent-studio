import { Check, Copy, ExternalLink, Loader2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "./useAuth";

export function LoginWaitDialog() {
  const auth = useAuth();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const authorizeUrl = auth.loginRequest?.authorizeUrl ?? "";
  const open = Boolean(auth.loginRequest);

  const handleCopy = async () => {
    if (!authorizeUrl || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(authorizeUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </div>
          <DialogTitle>{t("sidebar.user.loginWaitTitle")}</DialogTitle>
          <DialogDescription>
            {t("sidebar.user.loginWaitDescription")}
          </DialogDescription>
        </DialogHeader>

        {auth.loginError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {t("sidebar.user.loginWaitOpenError", { error: auth.loginError })}
          </div>
        )}

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {t("sidebar.user.loginWaitHint")}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={auth.cancelLogin}
            className="sm:mr-auto"
          >
            <X className="size-4" />
            {t("sidebar.user.loginWaitCancel")}
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleCopy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t("sidebar.user.loginWaitCopied") : t("sidebar.user.loginWaitCopy")}
          </Button>
          <Button type="button" onClick={() => void auth.reopenLogin()}>
            <ExternalLink className="size-4" />
            {t("sidebar.user.loginWaitReopen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
