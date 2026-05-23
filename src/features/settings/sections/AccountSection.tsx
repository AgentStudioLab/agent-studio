import { useTranslation } from "react-i18next";
import { ProfileForm } from "@/features/settings/ProfileForm";

export function AccountSection() {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="mb-6 text-[18px] font-semibold text-foreground">
        {t("settings.profile.title")}
      </h2>
      <ProfileForm />
    </section>
  );
}
