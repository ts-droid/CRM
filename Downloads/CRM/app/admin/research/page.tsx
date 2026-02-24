"use client";

import { FormEvent, useState } from "react";
import { useI18n } from "@/components/i18n";

type ResearchResponse = {
  query: {
    customerId: string | null;
    companyName: string;
    scope: "country" | "region";
  };
  websiteSnapshots: Array<{ url: string; title: string | null; vendoraFitScore: number }>;
  similarCustomers: Array<{ id: string; name: string; matchScore: number; potentialScore: number }>;
  aiPrompt: string;
  aiResult?: { provider: "gemini"; model: string; outputText: string } | null;
  aiError?: string | null;
};

export default function ResearchAdminPage() {
  const { lang } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<ResearchResponse | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const websitesRaw = String(form.get("websites") ?? "");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: String(form.get("customerId") ?? "").trim() || undefined,
          companyName: String(form.get("companyName") ?? "").trim() || undefined,
          scope: String(form.get("scope") ?? "region"),
          websites: websitesRaw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Research request failed");
      }

      setResult((await res.json()) as ResearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>{lang === "sv" ? "Admin: Research och AI-prompt" : "Admin: Research and AI prompt"}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {lang === "sv"
            ? "Ange kund-ID eller bolagsnamn, lägg till webbkällor och generera en färdig AI-prompt."
            : "Provide customer ID or company name, add website sources, and generate a ready AI prompt."}
        </p>
      </section>

      <section className="crm-card">
        <form onSubmit={onSubmit}>
          <div className="crm-row">
            <input className="crm-input" name="customerId" placeholder={lang === "sv" ? "Kund-ID (valfritt)" : "Customer ID (optional)"} />
            <input className="crm-input" name="companyName" placeholder={lang === "sv" ? "Bolagsnamn (om inget kund-ID)" : "Company name (if no customer ID)"} />
            <select className="crm-select" name="scope" defaultValue="region">
              <option value="region">{lang === "sv" ? "Liknande på region" : "Similar by region"}</option>
              <option value="country">{lang === "sv" ? "Liknande på land" : "Similar by country"}</option>
            </select>
          </div>

          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <textarea
              className="crm-textarea"
              name="websites"
              placeholder={lang === "sv" ? "Webbkällor, en URL per rad" : "Website sources, one URL per line"}
            />
          </div>

          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={loading}>
            {loading ? (lang === "sv" ? "Genererar..." : "Generating...") : lang === "sv" ? "Generera prompt" : "Generate prompt"}
          </button>

          {error ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.6rem" }}>{error}</p> : null}
        </form>
      </section>

      {result ? (
        <>
          <section className="crm-card">
            <h3>{lang === "sv" ? "Liknande bolag" : "Similar companies"}</h3>
            <div className="crm-list" style={{ marginTop: "0.7rem" }}>
              {result.similarCustomers.map((item) => (
                <article key={item.id} className="crm-item">
                  <div className="crm-item-head">
                    <strong>{item.name}</strong>
                    <span className="crm-badge">Match {item.matchScore}</span>
                  </div>
                  <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                    Potential: {item.potentialScore}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="crm-card">
            <h3>AI Prompt</h3>
            <pre className="crm-pre">{result.aiPrompt}</pre>
          </section>

          <section className="crm-card">
            <h3>{lang === "sv" ? "Gemini-svar" : "Gemini output"}</h3>
            {result.aiError ? (
              <p className="crm-subtle" style={{ color: "#b42318" }}>{result.aiError}</p>
            ) : null}
            {result.aiResult?.outputText ? (
              <>
                <p className="crm-subtle">
                  {result.aiResult.provider} · {result.aiResult.model}
                </p>
                <pre className="crm-pre">{result.aiResult.outputText}</pre>
              </>
            ) : (
              <p className="crm-subtle">
                {lang === "sv"
                  ? "Ingen LLM-output ännu. Kontrollera GEMINI_API_KEY och deploy."
                  : "No LLM output yet. Verify GEMINI_API_KEY and redeploy."}
              </p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
