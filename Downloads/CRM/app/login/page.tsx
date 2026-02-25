import Link from "next/link";

function errorText(code: string | null): string | null {
  if (!code) return null;
  if (code === "not_allowed") return "Ditt konto är inte tillåtet i CRM.";
  if (code === "oauth_failed") return "Google OAuth misslyckades. Försök igen.";
  if (code === "missing_code") return "Ogiltig callback från Google.";
  return "Inloggning misslyckades.";
}

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const error = errorText(searchParams?.error || null);
  const next = searchParams?.next || null;
  const authHref = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <section className="crm-card" style={{ maxWidth: 640, margin: "2rem auto" }}>
      <h2>Logga in</h2>
      <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
        Logga in med Google-konto (Vendora) för att använda CRM.
      </p>
      <div className="crm-row" style={{ marginTop: "1rem" }}>
        <Link href={authHref} className="crm-button">
          Logga in med Google
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
