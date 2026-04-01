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
        <a href="/" className="vendora-brandmark" style={{ textDecoration: "none" }}>
          <Image src="/vendora-logo-black.png" alt="Vendora Nordic" width={320} height={56} priority style={{ height: "28px", width: "auto" }} />
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Nav isAdmin={isAdmin} />

          {/* Show only the OTHER language as a toggle */}
          <button
            type="button"
            className="vendora-lang-toggle"
            onClick={() => setLang(lang === "sv" ? "en" : "sv")}
          >
            {lang === "sv" ? "🇬🇧 English" : "🇸🇪 Svenska"}
          </button>

          {userEmail && (
            <span style={{ fontSize: "13px", color: "var(--vendora-muted)", letterSpacing: "0.01em" }}>
              {userEmail}
            </span>
          )}

          {isAdmin && (
            <a href="/admin/research" className="vendora-btn vendora-btn-secondary" style={{ textDecoration: "none", padding: "10px 16px", fontSize: "13px" }}>
              Admin
            </a>
          )}

          {userEmail && (
            <button type="button" className="vendora-btn vendora-btn-primary" onClick={logout} style={{ padding: "10px 16px", fontSize: "13px" }}>
              {lang === "sv" ? "Logga ut" : "Log out"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
