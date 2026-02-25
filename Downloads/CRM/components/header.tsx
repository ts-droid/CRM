"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useI18n } from "@/components/i18n";

export function Header() {
  const { lang, setLang, t } = useI18n();
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { email?: string };
      })
      .then((data) => setUserEmail(data?.email || ""))
      .catch(() => setUserEmail(""));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

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
          {userEmail ? (
            <div className="crm-user">
              <span className="crm-subtle">{userEmail}</span>
              <button type="button" className="crm-button crm-button-secondary" onClick={logout}>
                {lang === "sv" ? "Logga ut" : "Log out"}
              </button>
            </div>
          ) : null}
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
