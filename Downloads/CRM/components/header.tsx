"use client";

import Image from "next/image";
import { Nav } from "@/components/nav";
import { useI18n } from "@/components/i18n";

export function Header() {
  const { lang, setLang, t } = useI18n();

  return (
    <header className="crm-header">
      <div className="crm-header-inner">
        <div className="crm-brand-wrap">
          <Image src="/vendora-logo.svg" alt="Vendora Nordic" width={36} height={36} className="crm-logo" priority />
          <div>
            <div className="crm-brand">{t("brandTitle")}</div>
            <div className="crm-brand-subtle">{t("brandSubtitle")}</div>
          </div>
        </div>

        <div className="crm-header-controls">
          <Nav />
          <div className="lang-switch" role="group" aria-label="Language switch">
            <button type="button" className={`lang-btn${lang === "sv" ? " active" : ""}`} onClick={() => setLang("sv")}>
              🇸🇪 {t("langSv")}
            </button>
            <button type="button" className={`lang-btn${lang === "en" ? " active" : ""}`} onClick={() => setLang("en")}>
              🇬🇧 {t("langEn")}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
