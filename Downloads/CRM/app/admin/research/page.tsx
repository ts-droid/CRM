"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";
import { useSearchParams } from "next/navigation";

type TabKey = "import-export" | "research" | "settings";

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

type MarkdownSection = {
  title: string;
  body: string;
};

function extractBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""))
    .slice(0, 8);
}

function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split("\n");
  const sections: MarkdownSection[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const pushCurrent = () => {
    if (!currentTitle && currentBody.length === 0) return;
    sections.push({
      title: currentTitle || "Output",
      body: currentBody.join("\n").trim()
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("## ")) {
      pushCurrent();
      currentTitle = line.replace(/^##\s+/, "").trim();
      currentBody = [];
    } else {
      currentBody.push(rawLine);
    }
  }

  pushCurrent();
  return sections.filter((section) => section.body.length > 0 || section.title !== "Output");
}

type ResearchConfig = {
  vendorWebsites: string[];
  brandWebsites: string[];
  extraInstructions: string;
  defaultScope: "region" | "country";
  industries: string[];
  countries: string[];
  sellers: string[];
  requiredCustomerFields: Array<"name" | "industry" | "country" | "seller">;
};

const EMPTY_CONFIG: ResearchConfig = {
  vendorWebsites: ["https://www.vendora.se"],
  brandWebsites: [],
  extraInstructions: "",
  defaultScope: "region",
  industries: ["Consumer Electronics", "Retail", "E-commerce", "B2B Reseller", "Enterprise IT"],
  countries: ["SE", "NO", "DK", "FI"],
  sellers: ["Team Nordics"],
  requiredCustomerFields: ["name", "industry", "country", "seller"]
};

function ResearchAdminContent() {
  const { lang } = useI18n();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>("research");
  const [researchCustomerId, setResearchCustomerId] = useState("");
  const [researchCompanyName, setResearchCompanyName] = useState("");
  const [researchScope, setResearchScope] = useState<"region" | "country">("region");

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string>("");
  const [result, setResult] = useState<ResearchResponse | null>(null);

  const [csvStatus, setCsvStatus] = useState<string>("");
  const [csvLoading, setCsvLoading] = useState(false);

  const [config, setConfig] = useState<ResearchConfig>(EMPTY_CONFIG);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string>("");

  const labels = useMemo(
    () => ({
      importExport: lang === "sv" ? "Import/Export" : "Import/Export",
      research: lang === "sv" ? "Research" : "Research",
      settings: lang === "sv" ? "Settings" : "Settings"
    }),
    [lang]
  );

  const aiText = result?.aiResult?.outputText ?? "";
  const aiBullets = useMemo(() => extractBullets(aiText), [aiText]);
  const aiSections = useMemo(() => parseMarkdownSections(aiText), [aiText]);

  async function loadSettings() {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { config?: ResearchConfig };
      if (data.config) setConfig(data.config);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "import-export" || tabParam === "research" || tabParam === "settings") {
      setTab(tabParam);
    }

    const customerIdParam = searchParams.get("customerId");
    const companyNameParam = searchParams.get("companyName");
    const scopeParam = searchParams.get("scope");

    if (customerIdParam) setResearchCustomerId(customerIdParam);
    if (companyNameParam) setResearchCompanyName(companyNameParam);
    if (scopeParam === "country" || scopeParam === "region") {
      setResearchScope(scopeParam);
    } else {
      setResearchScope(config.defaultScope);
    }
  }, [searchParams, config.defaultScope]);

  async function onResearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResearchLoading(true);
    setResearchError("");

    const form = new FormData(event.currentTarget);
    const websitesRaw = String(form.get("websites") ?? "");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: researchCustomerId.trim() || undefined,
          companyName: researchCompanyName.trim() || undefined,
          scope: researchScope,
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
      setResearchError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setResearchLoading(false);
    }
  }

  async function onCsvImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCsvLoading(true);
    setCsvStatus("");

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const res = await fetch("/api/admin/csv/import", {
        method: "POST",
        body: form
      });

      const data = (await res.json()) as { error?: string; created?: number; updated?: number; skipped?: number; total?: number };
      if (!res.ok) throw new Error(data.error ?? "Import failed");

      setCsvStatus(
        lang === "sv"
          ? `Import klar. Skapade: ${data.created ?? 0}, uppdaterade: ${data.updated ?? 0}, hoppade över: ${data.skipped ?? 0}, rader: ${data.total ?? 0}`
          : `Import complete. Created: ${data.created ?? 0}, updated: ${data.updated ?? 0}, skipped: ${data.skipped ?? 0}, rows: ${data.total ?? 0}`
      );
      formElement.reset();
    } catch (err) {
      setCsvStatus(err instanceof Error ? err.message : "Import failed");
    } finally {
      setCsvLoading(false);
    }
  }

  function onCsvExport() {
    window.location.href = "/api/admin/csv/export";
  }

  async function onSettingsSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsLoading(true);
    setSettingsStatus("");

    const form = new FormData(event.currentTarget);

    const payload: ResearchConfig = {
      vendorWebsites: String(form.get("vendorWebsites") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      brandWebsites: String(form.get("brandWebsites") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      extraInstructions: String(form.get("extraInstructions") ?? "").trim(),
      defaultScope: String(form.get("defaultScope") ?? "region") === "country" ? "country" : "region",
      industries: String(form.get("industries") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      countries: String(form.get("countries") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      sellers: String(form.get("sellers") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      requiredCustomerFields: (form.getAll("requiredCustomerFields") as string[]).filter(Boolean) as Array<
        "name" | "industry" | "country" | "seller"
      >
    };

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = (await res.json()) as { error?: string; config?: ResearchConfig };
      if (!res.ok) throw new Error(data.error ?? "Save failed");

      if (data.config) setConfig(data.config);
      setSettingsStatus(lang === "sv" ? "Inställningar sparade." : "Settings saved.");
    } catch (err) {
      setSettingsStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSettingsLoading(false);
    }
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>{lang === "sv" ? "Admin" : "Admin"}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {lang === "sv"
            ? "Hantera CSV, research och AI-inställningar i ett arbetsflöde."
            : "Manage CSV, research and AI settings in one workflow."}
        </p>

        <div className="crm-row" style={{ marginTop: "0.8rem" }}>
          <button className={`crm-tab ${tab === "import-export" ? "active" : ""}`} type="button" onClick={() => setTab("import-export")}>{labels.importExport}</button>
          <button className={`crm-tab ${tab === "research" ? "active" : ""}`} type="button" onClick={() => setTab("research")}>{labels.research}</button>
          <button className={`crm-tab ${tab === "settings" ? "active" : ""}`} type="button" onClick={() => setTab("settings")}>{labels.settings}</button>
        </div>
      </section>

      {tab === "import-export" ? (
        <section className="crm-card">
          <h3>{labels.importExport}</h3>
          <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
            {lang === "sv"
              ? "Importera kunddata via CSV och exportera aktuell kunddatabas."
              : "Import customer data via CSV and export the current customer dataset."}
          </p>

          <form onSubmit={onCsvImport} style={{ marginTop: "0.7rem" }}>
            <input className="crm-input" type="file" name="file" accept=".csv,text/csv" required />
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <button className="crm-button" type="submit" disabled={csvLoading}>
                {csvLoading ? (lang === "sv" ? "Importerar..." : "Importing...") : (lang === "sv" ? "Importera CSV" : "Import CSV")}
              </button>
              <button className="crm-button crm-button-secondary" type="button" onClick={onCsvExport}>
                {lang === "sv" ? "Exportera CSV" : "Export CSV"}
              </button>
            </div>
            {csvStatus ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{csvStatus}</p> : null}
          </form>
        </section>
      ) : null}

      {tab === "research" ? (
        <>
          <section className="crm-card">
            <h3>{lang === "sv" ? "Research och AI-prompt" : "Research and AI prompt"}</h3>
            <form onSubmit={onResearchSubmit} style={{ marginTop: "0.7rem" }}>
              <div className="crm-row">
                <input
                  className="crm-input"
                  name="customerId"
                  value={researchCustomerId}
                  onChange={(event) => setResearchCustomerId(event.target.value)}
                  placeholder={lang === "sv" ? "Kund-ID (valfritt)" : "Customer ID (optional)"}
                />
                <input
                  className="crm-input"
                  name="companyName"
                  value={researchCompanyName}
                  onChange={(event) => setResearchCompanyName(event.target.value)}
                  placeholder={lang === "sv" ? "Bolagsnamn (om inget kund-ID)" : "Company name (if no customer ID)"}
                />
                <select className="crm-select" name="scope" value={researchScope} onChange={(event) => setResearchScope(event.target.value === "country" ? "country" : "region")}>
                  <option value="region">{lang === "sv" ? "Liknande på region" : "Similar by region"}</option>
                  <option value="country">{lang === "sv" ? "Liknande på land" : "Similar by country"}</option>
                </select>
              </div>

              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea className="crm-textarea" name="websites" placeholder={lang === "sv" ? "Extra webbkällor, en URL per rad" : "Extra website sources, one URL per line"} />
              </div>

              <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={researchLoading}>
                {researchLoading ? (lang === "sv" ? "Genererar..." : "Generating...") : (lang === "sv" ? "Generera prompt" : "Generate prompt")}
              </button>
              {researchError ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.6rem" }}>{researchError}</p> : null}
            </form>
          </section>

          {result ? (
            <>
              <section className="crm-card">
                <h3>{lang === "sv" ? "Researchsammanfattning" : "Research summary"}</h3>
                <div className="crm-grid" style={{ marginTop: "0.7rem" }}>
                  <article className="crm-item">
                    <p className="crm-subtle">{lang === "sv" ? "Bolag" : "Company"}</p>
                    <strong>{result.query.companyName}</strong>
                  </article>
                  <article className="crm-item">
                    <p className="crm-subtle">{lang === "sv" ? "Scope" : "Scope"}</p>
                    <strong>{result.query.scope === "region" ? (lang === "sv" ? "Region" : "Region") : (lang === "sv" ? "Land" : "Country")}</strong>
                  </article>
                  <article className="crm-item">
                    <p className="crm-subtle">{lang === "sv" ? "Liknande bolag" : "Similar companies"}</p>
                    <strong>{result.similarCustomers.length}</strong>
                  </article>
                  <article className="crm-item">
                    <p className="crm-subtle">{lang === "sv" ? "Datakällor" : "Data sources"}</p>
                    <strong>{result.websiteSnapshots.length}</strong>
                  </article>
                </div>
              </section>

              <section className="crm-card">
                <h3>{lang === "sv" ? "Liknande bolag" : "Similar companies"}</h3>
                <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                  {result.similarCustomers.map((item, index) => (
                    <article key={item.id} className="crm-item">
                      <div className="crm-item-head">
                        <strong>{index + 1}. {item.name}</strong>
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
                <h3>{lang === "sv" ? "Källor och signaler" : "Sources and signals"}</h3>
                <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                  {result.websiteSnapshots.length === 0 ? (
                    <p className="crm-empty">{lang === "sv" ? "Inga webbkällor hittades." : "No web sources found."}</p>
                  ) : (
                    result.websiteSnapshots.map((item) => (
                      <article key={item.url} className="crm-item">
                        <div className="crm-item-head">
                          <a href={item.url} target="_blank" rel="noreferrer" className="crm-link-inline">{item.title || item.url}</a>
                          <span className="crm-badge">{lang === "sv" ? "Fit" : "Fit"}: {item.vendoraFitScore}</span>
                        </div>
                        <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>{item.url}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="crm-card">
                <h3>{lang === "sv" ? "AI-rekommendationer" : "AI recommendations"}</h3>
                {result.aiError ? <p className="crm-subtle" style={{ color: "#b42318" }}>{result.aiError}</p> : null}
                {aiBullets.length > 0 ? (
                  <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                    {aiBullets.map((bullet, index) => (
                      <article key={`${bullet}-${index}`} className="crm-item">
                        <p>{index + 1}. {bullet}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
                    {lang === "sv" ? "Ingen strukturerad rekommendation hittades, se full AI-output nedan." : "No structured recommendation found, see full AI output below."}
                  </p>
                )}
              </section>

              <section className="crm-card">
                <h3>AI Prompt</h3>
                <pre className="crm-pre">{result.aiPrompt}</pre>
              </section>

              <section className="crm-card">
                <h3>{lang === "sv" ? "Gemini-svar" : "Gemini output"}</h3>
                {result.aiError ? <p className="crm-subtle" style={{ color: "#b42318" }}>{result.aiError}</p> : null}
                {result.aiResult?.outputText ? (
                  <>
                    <p className="crm-subtle">{result.aiResult.provider} · {result.aiResult.model}</p>
                    {aiSections.length > 0 ? (
                      <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                        {aiSections.map((section) => (
                          <article key={section.title} className="crm-item">
                            <h4 style={{ margin: 0 }}>{section.title}</h4>
                            <pre className="crm-pre" style={{ marginTop: "0.55rem" }}>{section.body}</pre>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <pre className="crm-pre">{result.aiResult.outputText}</pre>
                    )}
                  </>
                ) : (
                  <p className="crm-subtle">{lang === "sv" ? "Ingen LLM-output ännu." : "No LLM output yet."}</p>
                )}
              </section>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "settings" ? (
        <section className="crm-card">
          <h3>{labels.settings}</h3>
          <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
            {lang === "sv"
              ? "Ange Vendora/brand-webbsidor och extra instruktioner som alltid ska användas i research-flödet."
              : "Set Vendora/brand websites and extra instructions always used in research."}
          </p>

          <form onSubmit={onSettingsSave} style={{ marginTop: "0.7rem" }}>
            <div className="crm-row">
              <select className="crm-select" name="defaultScope" defaultValue={config.defaultScope}>
                <option value="region">{lang === "sv" ? "Default scope: Region" : "Default scope: Region"}</option>
                <option value="country">{lang === "sv" ? "Default scope: Land" : "Default scope: Country"}</option>
              </select>
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                name="vendorWebsites"
                defaultValue={config.vendorWebsites.join("\n")}
                placeholder={lang === "sv" ? "Vendora-webbsidor, en URL per rad" : "Vendora websites, one URL per line"}
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                name="brandWebsites"
                defaultValue={config.brandWebsites.join("\n")}
                placeholder={lang === "sv" ? "Brand-webbsidor, en URL per rad" : "Brand websites, one URL per line"}
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                name="industries"
                defaultValue={config.industries.join("\n")}
                placeholder={lang === "sv" ? "Branscher, en per rad" : "Industries, one per line"}
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                name="countries"
                defaultValue={config.countries.join("\n")}
                placeholder={lang === "sv" ? "Länder (t.ex. SE), en per rad" : "Countries (e.g. SE), one per line"}
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                name="sellers"
                defaultValue={config.sellers.join("\n")}
                placeholder={lang === "sv" ? "Säljare, en per rad" : "Sellers, one per line"}
              />
            </div>
            <div style={{ marginTop: "0.6rem" }}>
              <p className="crm-subtle">{lang === "sv" ? "Obligatoriska kundfält" : "Required customer fields"}</p>
              <div className="crm-row" style={{ marginTop: "0.4rem" }}>
                <label className="crm-check">
                  <input type="checkbox" name="requiredCustomerFields" value="name" defaultChecked={config.requiredCustomerFields.includes("name")} />
                  <span>Name</span>
                </label>
                <label className="crm-check">
                  <input type="checkbox" name="requiredCustomerFields" value="industry" defaultChecked={config.requiredCustomerFields.includes("industry")} />
                  <span>Industry</span>
                </label>
                <label className="crm-check">
                  <input type="checkbox" name="requiredCustomerFields" value="country" defaultChecked={config.requiredCustomerFields.includes("country")} />
                  <span>Country</span>
                </label>
                <label className="crm-check">
                  <input type="checkbox" name="requiredCustomerFields" value="seller" defaultChecked={config.requiredCustomerFields.includes("seller")} />
                  <span>Seller</span>
                </label>
              </div>
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                name="extraInstructions"
                defaultValue={config.extraInstructions}
                placeholder={lang === "sv" ? "Extra AI-instruktioner" : "Extra AI instructions"}
              />
            </div>
            <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={settingsLoading}>
              {settingsLoading ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara inställningar" : "Save settings")}
            </button>
            {settingsStatus ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{settingsStatus}</p> : null}
          </form>
        </section>
      ) : null}
    </div>
  );
}

export default function ResearchAdminPage() {
  return (
    <Suspense fallback={<section className="crm-card">Loading research...</section>}>
      <ResearchAdminContent />
    </Suspense>
  );
}
