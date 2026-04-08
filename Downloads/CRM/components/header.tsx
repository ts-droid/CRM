"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useI18n } from "@/components/i18n";

export function Header() {
  const { lang, setLang } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { email?: string; isAdmin?: boolean };
      })
      .then((data) => {
        setIsAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        setIsAdmin(false);
      });
  }, []);

  return (
    <header className="vendora-header">
      <div className="vendora-header-inner">
        <a href="/" className="vendora-brandmark" style={{ textDecoration: "none" }}>
          <Image src="/vendora-logo-black.png" alt="Vendora Nordic" width={320} height={56} priority style={{ height: "28px", width: "auto" }} />
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Nav isAdmin={isAdmin} />

          <button
            type="button"
            className="vendora-lang-toggle"
            onClick={() => setLang(lang === "sv" ? "en" : "sv")}
          >
            {lang === "sv" ? "🇬🇧 English" : "🇸🇪 Svenska"}
          </button>

          {isAdmin && (
            <>
              <a href="/admin/research" className="vendora-btn vendora-btn-secondary" style={{ textDecoration: "none", padding: "10px 16px", fontSize: "13px" }}>
                Admin
              </a>
              <a href="/admin/users" className="vendora-btn vendora-btn-secondary" style={{ textDecoration: "none", padding: "10px 16px", fontSize: "13px" }}>
                {lang === "sv" ? "Användare" : "Users"}
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
