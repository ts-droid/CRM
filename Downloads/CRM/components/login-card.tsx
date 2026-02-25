"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n";

function errorText(code: string | null, lang: "sv" | "en"): string | null {
  if (!code) return null;
  if (code === "not_allowed") {
    return lang === "sv" ? "Ditt konto är inte tillåtet i CRM." : "Your account is not allowed in this CRM.";
  }
  if (code === "oauth_failed") {
    return lang === "sv" ? "Google OAuth misslyckades. Försök igen." : "Google OAuth failed. Please try again.";
  }
  if (code === "missing_code") {
    return lang === "sv" ? "Ogiltig callback från Google." : "Invalid callback from Google.";
  }
  return lang === "sv" ? "Inloggning misslyckades." : "Sign-in failed.";
}

export function LoginCard({ errorCode, next }: { errorCode: string | null; next: string | null }) {
  const { lang } = useI18n();
  const authHref = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const error = errorText(errorCode, lang);

  return (
    <section className="crm-card" style={{ maxWidth: 640, margin: "2rem auto" }}>
      <h2>{lang === "sv" ? "Logga in" : "Sign in"}</h2>
      <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
        {lang === "sv"
          ? "Logga in med Google-konto (Vendora) för att använda CRM."
          : "Sign in with your Google account (Vendora) to use the CRM."}
      </p>
      <div className="crm-row" style={{ marginTop: "1rem" }}>
        <Link href={authHref} className="crm-button">
          {lang === "sv" ? "Logga in med Google" : "Sign in with Google"}
        </Link>
      </div>
      {error ? (
        <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.7rem" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
