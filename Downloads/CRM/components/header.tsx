"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useI18n } from "@/components/i18n";

export function Header() {
  const { lang, setLang } = useI18n();
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { email?: string; isAdmin?: boolean };
      })
      .then((data) => {
        setUserEmail(data?.email || "");
        setIsAdmin(Boolean(data?.isAdmin));
      })
      .catch(() => {
        setUserEmail("");
        setIsAdmin(false);
      });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="vendora-header">
      <div className="vendora-header-inner">
        <div className="vendora-brandmark">
          <Image src="/vendora-logo-black.png" alt="Vendora Nordic" width={160} height={28} priority />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Nav isAdmin={isAdmin} />

          <button
            type="button"
            className={`lang-btn${lang === "sv" ? " active" : ""}`}
            onClick={() => setLang("sv")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", opacity: lang === "sv" ? 1 : 0.5 }}
          >
            🇸🇪
          </button>
          <button
            type="button"
            className={`lang-btn${lang === "en" ? " active" : ""}`}
            onClick={() => setLang("en")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", opacity: lang === "en" ? 1 : 0.5 }}
          >
            🇬🇧
          </button>

          {userEmail && (
            <span style={{ fontSize: "13px", color: "var(--vendora-muted)" }}>{userEmail}</span>
          )}

          {isAdmin && (
            <a href="/admin/research" className="vendora-btn vendora-btn-secondary" style={{ textDecoration: "none" }}>
              Admin
            </a>
          )}

          {userEmail && (
            <button type="button" className="vendora-btn vendora-btn-primary" onClick={logout}>
              {lang === "sv" ? "Logga ut" : "Log out"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
