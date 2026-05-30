import { useTranslation } from "react-i18next";
import { ThemeSegment } from "@/shared/atoms/ThemeSegment";
import { BrandPicker } from "@/shared/atoms/BrandPicker";
import { LanguageSegment } from "@/shared/atoms/LanguageSegment";

export function AppearanceSection() {
  const { t } = useTranslation();
  return (
    <section>
      <h2 className="mb-6 text-[18px] font-semibold text-foreground">
        {t("settings.appearance.title")}
      </h2>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            {t("settings.appearance.theme")}
          </label>
          <ThemeSegment />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            {t("settings.appearance.brand")}
          </label>
          <BrandPicker />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            {t("settings.appearance.language")}
          </label>
          <LanguageSegment />
        </div>
      </div>
    </section>
  );
}
