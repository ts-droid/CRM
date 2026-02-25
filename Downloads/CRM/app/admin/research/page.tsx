"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";
import { useSearchParams } from "next/navigation";

type TabKey = "import-export" | "research" | "settings";
type SettingsTabKey = "base" | "prompts" | "notifications";

type ResearchResponse = {
  query: {
    customerId: string | null;
    companyName: string;
    scope: "country" | "region";
    segmentFocus?: "B2B" | "B2C" | "MIXED";
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
  researchBasePrompt: string;
  quickSimilarBasePrompt: string;
  quickSimilarExtraInstructions: string;
  extraInstructions: string;
  defaultScope: "region" | "country";
  industries: string[];
  countries: string[];
  regionsByCountry: Array<{ country: string; regions: string[] }>;
  sellers: string[];
  sellerAssignments: Array<{ seller: string; emails: string[] }>;
  requiredCustomerFields: Array<"name" | "industry" | "country" | "seller">;
  remindersEnabled: boolean;
  reminderDaysBeforeDeadline: number;
  inactivityReminderDays: number;
  reminderRecipients: string[];
  notifyViaSlack: boolean;
  slackWebhookUrl: string;
  notifyViaEmail: boolean;
  gmailFrom: string;
  gmailReplyTo: string;
};

const EMPTY_CONFIG: ResearchConfig = {
  vendorWebsites: ["https://www.vendora.se"],
  brandWebsites: [],
  researchBasePrompt:
    "You are a senior GTM & Channel Analyst for Vendora Nordic.\n\n" +
    "Your task is to evaluate one selected reseller account and produce a practical expansion plan:\n" +
    "1) Score assortment fit (FitScore 0-100).\n" +
    "2) Quantify Year-1 potential (Low/Base/High range, SEK unless specified).\n" +
    "3) Recommend concrete product families/brands to pitch.\n" +
    "4) Propose and score similar targets using the same scoring logic.\n\n" +
    "Rules:\n" +
    "- English only.\n" +
    "- Do not invent facts.\n" +
    "- Mark unknowns as Estimated + confidence.\n" +
    "- If key data is missing, stay conservative.\n" +
    "- Keep output CRM-ready and actionable.",
  quickSimilarBasePrompt:
    "You are an analyst. Return only compact, evidence-based similar reseller accounts for the selected customer. Prioritize practical fit and likely volume.",
  quickSimilarExtraInstructions:
    "Keep the response short. Focus on similar profile in segment, geography and category focus.",
  extraInstructions: "",
  defaultScope: "region",
  industries: [
    "Consumer Electronics",
    "Computer & IT Retail",
    "Mobile & Telecom Retail",
    "Office Supplies & Workplace",
    "B2B IT Reseller",
    "B2B E-commerce",
    "Managed Service Provider (MSP)",
    "System Integrator",
    "AV & Meeting Room Solutions",
    "Smart Home Retail",
    "Home Electronics & Appliances",
    "Photo & Video Retail",
    "Gaming & Esports Retail",
    "Education & School Supplier",
    "Public Sector Procurement",
    "Industrial & Field Service Supply",
    "Hospitality & POS Solutions",
    "Security & Surveillance Integrator",
    "Lifestyle & Design Retail",
    "Marketplace / Pure E-tail"
  ],
  countries: ["SE", "NO", "DK", "FI", "EE", "LV", "LT"],
  regionsByCountry: [
    { country: "SE", regions: ["Stockholm", "Vastra Gotaland", "Skane", "Ostergotland", "Jonkoping", "Uppsala", "Halland", "Sodermanland"] },
    { country: "NO", regions: ["Oslo", "Viken", "Vestland", "Rogaland", "Trondelag", "Agder", "Innlandet", "Troms og Finnmark"] },
    { country: "DK", regions: ["Hovedstaden", "Sjaelland", "Syddanmark", "Midtjylland", "Nordjylland"] },
    { country: "FI", regions: ["Uusimaa", "Pirkanmaa", "Varsinais-Suomi", "Pohjois-Pohjanmaa", "Keski-Suomi", "Satakunta", "Pohjanmaa", "Lappi"] },
    { country: "EE", regions: ["Harju", "Tartu", "Ida-Viru", "Parnu", "Laane-Viru", "Viljandi", "Rapla", "Saare"] },
    { country: "LV", regions: ["Riga", "Pieriga", "Kurzeme", "Zemgale", "Vidzeme", "Latgale"] },
    { country: "LT", regions: ["Vilnius", "Kaunas", "Klaipeda", "Siauliai", "Panevezys", "Alytus", "Marijampole", "Utena", "Taurage", "Telsiai"] }
  ],
  sellers: ["Team Nordics"],
  sellerAssignments: [],
  requiredCustomerFields: ["name", "industry", "country", "seller"],
  remindersEnabled: true,
  reminderDaysBeforeDeadline: 7,
  inactivityReminderDays: 30,
  reminderRecipients: [],
  notifyViaSlack: false,
  slackWebhookUrl: "",
  notifyViaEmail: false,
  gmailFrom: "",
  gmailReplyTo: ""
};

function formatSellerAssignments(value: ResearchConfig["sellerAssignments"]): string {
  return value
    .map((entry) => {
      const seller = String(entry.seller || "").trim();
      const emails = (entry.emails || []).map((email) => String(email || "").trim().toLowerCase()).filter(Boolean);
      if (!seller || emails.length === 0) return "";
      return `${seller}: ${emails.join(", ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseSellerAssignments(text: string): ResearchConfig["sellerAssignments"] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: ResearchConfig["sellerAssignments"] = [];

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    const seller = line.slice(0, separatorIndex).trim();
    if (!seller || seen.has(seller)) continue;
    const emails = line
      .slice(separatorIndex + 1)
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) continue;
    result.push({ seller, emails });
    seen.add(seller);
  }

  return result;
}

function formatRegionsByCountry(value: ResearchConfig["regionsByCountry"]): string {
  return value
    .map((entry) => {
      const country = String(entry.country || "").trim().toUpperCase();
      const regions = (entry.regions || []).map((region) => String(region || "").trim()).filter(Boolean);
      if (!country || regions.length === 0) return "";
      return `${country}: ${regions.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseRegionsByCountry(text: string): ResearchConfig["regionsByCountry"] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: ResearchConfig["regionsByCountry"] = [];

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    const country = line.slice(0, separatorIndex).trim().toUpperCase();
    if (!country || seen.has(country)) continue;
    const regions = line
      .slice(separatorIndex + 1)
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
    if (regions.length === 0) continue;
    result.push({ country, regions });
    seen.add(country);
  }

  return result;
}

function ResearchAdminContent() {
  const { lang } = useI18n();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>("research");
  const [researchCustomerId, setResearchCustomerId] = useState("");
  const [researchCompanyName, setResearchCompanyName] = useState("");
  const [researchScope, setResearchScope] = useState<"region" | "country">("region");
  const [researchSegmentFocus, setResearchSegmentFocus] = useState<"AUTO" | "B2B" | "B2C" | "MIXED">("AUTO");

  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string>("");
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [researchBasePromptDraft, setResearchBasePromptDraft] = useState("");
  const [researchExtraInstructionsDraft, setResearchExtraInstructionsDraft] = useState("");
  const [autoRunKey, setAutoRunKey] = useState("");

  const [csvStatus, setCsvStatus] = useState<string>("");
  const [csvLoading, setCsvLoading] = useState(false);

  const [config, setConfig] = useState<ResearchConfig>(EMPTY_CONFIG);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<string>("");
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>("base");
  const [sellerDraft, setSellerDraft] = useState("");
  const [reassignFromSeller, setReassignFromSeller] = useState("");
  const [reassignToSeller, setReassignToSeller] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);
  const [reassignStatus, setReassignStatus] = useState("");
  const [remindersRunning, setRemindersRunning] = useState(false);
  const [remindersStatus, setRemindersStatus] = useState("");

  const labels = useMemo(
    () => ({
      importExport: lang === "sv" ? "Import/Export" : "Import/Export",
      research: lang === "sv" ? "Research" : "Research",
      settings: lang === "sv" ? "Settings" : "Settings"
    }),
    [lang]
  );
  const settingsFormKey = useMemo(() => JSON.stringify(config), [config]);

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
    if (!researchBasePromptDraft && config.researchBasePrompt) {
      setResearchBasePromptDraft(config.researchBasePrompt);
    }
  }, [config.researchBasePrompt, researchBasePromptDraft]);

  useEffect(() => {
    if (!researchExtraInstructionsDraft && config.extraInstructions) {
      setResearchExtraInstructionsDraft(config.extraInstructions);
    }
  }, [config.extraInstructions, researchExtraInstructionsDraft]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "import-export" || tabParam === "research" || tabParam === "settings") {
      setTab(tabParam);
    }

    const customerIdParam = searchParams.get("customerId");
    const companyNameParam = searchParams.get("companyName");
    const scopeParam = searchParams.get("scope");
    const segmentParam = searchParams.get("segmentFocus");

    if (customerIdParam) setResearchCustomerId(customerIdParam);
    if (companyNameParam) setResearchCompanyName(companyNameParam);
    if (scopeParam === "country" || scopeParam === "region") {
      setResearchScope(scopeParam);
    } else {
      setResearchScope(config.defaultScope);
    }
    if (segmentParam === "B2B" || segmentParam === "B2C" || segmentParam === "MIXED") {
      setResearchSegmentFocus(segmentParam);
    } else {
      setResearchSegmentFocus("AUTO");
    }
  }, [searchParams, config.defaultScope]);

  async function conductResearch(websitesRaw: string) {
    setResearchLoading(true);
    setResearchError("");

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: researchCustomerId.trim() || undefined,
          companyName: researchCompanyName.trim() || undefined,
          scope: researchScope,
          segmentFocus: researchSegmentFocus === "AUTO" ? undefined : researchSegmentFocus,
          basePrompt: researchBasePromptDraft.trim() || undefined,
          extraInstructions: researchExtraInstructionsDraft.trim() || undefined,
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

  async function onResearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const websitesRaw = String(form.get("websites") ?? "");
    await conductResearch(websitesRaw);
  }

  useEffect(() => {
    const shouldAutoRun = searchParams.get("autorun") === "1";
    if (!shouldAutoRun) return;
    if (!researchCustomerId.trim() && !researchCompanyName.trim()) return;
    const nextKey = `${researchCustomerId.trim()}|${researchCompanyName.trim()}`;
    if (nextKey === autoRunKey) return;
    setAutoRunKey(nextKey);
    conductResearch("");
  }, [searchParams, autoRunKey, researchCustomerId, researchCompanyName]);

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
      researchBasePrompt: String(form.get("researchBasePrompt") ?? "").trim(),
      quickSimilarBasePrompt: String(form.get("quickSimilarBasePrompt") ?? "").trim(),
      quickSimilarExtraInstructions: String(form.get("quickSimilarExtraInstructions") ?? "").trim(),
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
      regionsByCountry: parseRegionsByCountry(String(form.get("regionsByCountry") ?? "")),
      sellers: String(form.get("sellers") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      sellerAssignments: parseSellerAssignments(String(form.get("sellerAssignments") ?? "")),
      requiredCustomerFields: (form.getAll("requiredCustomerFields") as string[]).filter(Boolean) as Array<
        "name" | "industry" | "country" | "seller"
      >,
      remindersEnabled: form.get("remindersEnabled") === "on",
      reminderDaysBeforeDeadline: Number(form.get("reminderDaysBeforeDeadline") || 7),
      inactivityReminderDays: Number(form.get("inactivityReminderDays") || 30),
      reminderRecipients: String(form.get("reminderRecipients") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      notifyViaSlack: form.get("notifyViaSlack") === "on",
      slackWebhookUrl: String(form.get("slackWebhookUrl") ?? "").trim(),
      notifyViaEmail: form.get("notifyViaEmail") === "on",
      gmailFrom: String(form.get("gmailFrom") ?? "").trim(),
      gmailReplyTo: String(form.get("gmailReplyTo") ?? "").trim()
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

  function addSellerDraft() {
    const nextSeller = sellerDraft.trim();
    if (!nextSeller) return;
    if (config.sellers.includes(nextSeller)) {
      setSettingsStatus(lang === "sv" ? "Säljare finns redan." : "Seller already exists.");
      return;
    }
    setConfig((prev) => ({ ...prev, sellers: [...prev.sellers, nextSeller] }));
    setSellerDraft("");
    setSettingsStatus("");
  }

  function removeSeller(name: string) {
    if (!name) return;
    setConfig((prev) => ({
      ...prev,
      sellers: prev.sellers.filter((seller) => seller !== name),
      sellerAssignments: prev.sellerAssignments.filter((assignment) => assignment.seller !== name)
    }));
    if (reassignFromSeller === name) setReassignFromSeller("");
    if (reassignToSeller === name) setReassignToSeller("");
    setSettingsStatus("");
  }

  async function runSellerReassign() {
    if (!reassignFromSeller || !reassignToSeller || reassignFromSeller === reassignToSeller) {
      setReassignStatus(lang === "sv" ? "Välj två olika säljare." : "Select two different sellers.");
      return;
    }

    setReassignLoading(true);
    setReassignStatus("");
    try {
      const res = await fetch("/api/admin/sellers/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromSeller: reassignFromSeller, toSeller: reassignToSeller })
      });
      const data = (await res.json()) as { moved?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to reassign customers");
      setReassignStatus(
        lang === "sv"
          ? `Kundbytet klart. Flyttade ${data.moved ?? 0} kunder.`
          : `Reassignment done. Moved ${data.moved ?? 0} customers.`
      );
    } catch (error) {
      setReassignStatus(error instanceof Error ? error.message : "Failed to reassign customers");
    } finally {
      setReassignLoading(false);
    }
  }

  async function runRemindersNow() {
    setRemindersRunning(true);
    setRemindersStatus("");
    try {
      const res = await fetch("/api/admin/reminders/run", { method: "POST" });
      const data = (await res.json()) as { sent?: number; skipped?: number; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to run reminders");
      }
      setRemindersStatus(
        lang === "sv"
          ? `Påminnelser körda. Skickade: ${data.sent ?? 0}, redan hanterade: ${data.skipped ?? 0}.`
          : `Reminders executed. Sent: ${data.sent ?? 0}, already handled: ${data.skipped ?? 0}.`
      );
    } catch (error) {
      setRemindersStatus(error instanceof Error ? error.message : "Failed to run reminders");
    } finally {
      setRemindersRunning(false);
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
                <select
                  className="crm-select"
                  name="segmentFocus"
                  value={researchSegmentFocus}
                  onChange={(event) =>
                    setResearchSegmentFocus(
                      event.target.value === "B2B" || event.target.value === "B2C" || event.target.value === "MIXED"
                        ? event.target.value
                        : "AUTO"
                    )
                  }
                >
                  <option value="AUTO">{lang === "sv" ? "Segment: Auto från kund" : "Segment: Auto from customer"}</option>
                  <option value="B2B">Segment: B2B</option>
                  <option value="B2C">Segment: B2C</option>
                  <option value="MIXED">{lang === "sv" ? "Segment: Mixad" : "Segment: Mixed"}</option>
                </select>
              </div>

              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea className="crm-textarea" name="websites" placeholder={lang === "sv" ? "Extra webbkällor, en URL per rad" : "Extra website sources, one URL per line"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  value={researchBasePromptDraft}
                  onChange={(event) => setResearchBasePromptDraft(event.target.value)}
                  placeholder={lang === "sv" ? "Grundprompt för denna körning" : "Base prompt for this run"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.4rem" }}>
                <button
                  className="crm-button crm-button-secondary"
                  type="button"
                  onClick={() => setResearchBasePromptDraft(config.researchBasePrompt)}
                >
                  {lang === "sv" ? "Återställ grundprompt" : "Reset base prompt"}
                </button>
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  value={researchExtraInstructionsDraft}
                  onChange={(event) => setResearchExtraInstructionsDraft(event.target.value)}
                  placeholder={
                    lang === "sv"
                      ? "Extra AI-instruktioner för denna körning (t.ex. Only show companies with revenue > 50 MSEK)"
                      : "Extra AI instructions for this run (e.g. Only show companies with revenue > 50 MSEK)"
                  }
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.4rem" }}>
                <button
                  className="crm-button crm-button-secondary"
                  type="button"
                  onClick={() => setResearchExtraInstructionsDraft(config.extraInstructions)}
                >
                  {lang === "sv" ? "Återställ extra instruktioner" : "Reset extra instructions"}
                </button>
              </div>

              <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={researchLoading}>
                {researchLoading ? (lang === "sv" ? "Analyserar..." : "Analyzing...") : (lang === "sv" ? "Genomför research" : "Conduct research")}
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
                    <p className="crm-subtle">{lang === "sv" ? "Segmentfokus" : "Segment focus"}</p>
                    <strong>{result.query.segmentFocus ?? "MIXED"}</strong>
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
          <div className="crm-row" style={{ marginTop: "0.7rem" }}>
            <button
              type="button"
              className={`crm-tab ${settingsTab === "base" ? "active" : ""}`}
              onClick={() => setSettingsTab("base")}
            >
              {lang === "sv" ? "Grundinställningar" : "Base settings"}
            </button>
            <button
              type="button"
              className={`crm-tab ${settingsTab === "prompts" ? "active" : ""}`}
              onClick={() => setSettingsTab("prompts")}
            >
              {lang === "sv" ? "Prompter" : "Prompts"}
            </button>
            <button
              type="button"
              className={`crm-tab ${settingsTab === "notifications" ? "active" : ""}`}
              onClick={() => setSettingsTab("notifications")}
            >
              {lang === "sv" ? "Mail/Slack" : "Mail/Slack"}
            </button>
          </div>

          <form key={settingsFormKey} onSubmit={onSettingsSave} style={{ marginTop: "0.7rem" }}>
            <section style={{ display: settingsTab === "base" ? "block" : "none" }}>
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
                  name="regionsByCountry"
                  defaultValue={formatRegionsByCountry(config.regionsByCountry)}
                  placeholder={lang === "sv" ? "Regioner per land, format: SE: Stockholm | Skane" : "Regions per country, format: SE: Stockholm | Skane"}
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
              <div className="crm-row" style={{ marginTop: "0.55rem" }}>
                <input
                  className="crm-input"
                  value={sellerDraft}
                  onChange={(event) => setSellerDraft(event.target.value)}
                  placeholder={lang === "sv" ? "Ny säljare (namn)" : "New seller (name)"}
                />
                <button className="crm-button crm-button-secondary" type="button" onClick={addSellerDraft}>
                  {lang === "sv" ? "Lägg till säljare" : "Add seller"}
                </button>
                <select className="crm-select" defaultValue="" onChange={(event) => removeSeller(event.target.value)}>
                  <option value="" disabled>{lang === "sv" ? "Ta bort säljare" : "Remove seller"}</option>
                  {config.sellers.map((seller) => (
                    <option key={seller} value={seller}>{seller}</option>
                  ))}
                </select>
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  name="sellerAssignments"
                  defaultValue={formatSellerAssignments(config.sellerAssignments)}
                  placeholder={
                    lang === "sv"
                      ? "Säljare till e-post, format: Team Nordics: ts@vendora.se, anna@vendora.se"
                      : "Seller to email mapping, format: Team Nordics: ts@vendora.se, anna@vendora.se"
                  }
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.55rem" }}>
                <select className="crm-select" value={reassignFromSeller} onChange={(event) => setReassignFromSeller(event.target.value)}>
                  <option value="">{lang === "sv" ? "Flytta från säljare" : "Move from seller"}</option>
                  {config.sellers.map((seller) => (
                    <option key={`from-${seller}`} value={seller}>{seller}</option>
                  ))}
                </select>
                <select className="crm-select" value={reassignToSeller} onChange={(event) => setReassignToSeller(event.target.value)}>
                  <option value="">{lang === "sv" ? "Flytta till säljare" : "Move to seller"}</option>
                  {config.sellers.map((seller) => (
                    <option key={`to-${seller}`} value={seller}>{seller}</option>
                  ))}
                </select>
                <button className="crm-button crm-button-secondary" type="button" disabled={reassignLoading} onClick={runSellerReassign}>
                  {reassignLoading ? (lang === "sv" ? "Flyttar..." : "Moving...") : (lang === "sv" ? "Byt säljare på kunder" : "Reassign customers")}
                </button>
              </div>
              {reassignStatus ? <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>{reassignStatus}</p> : null}
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
            </section>

            <section style={{ display: settingsTab === "prompts" ? "block" : "none" }}>
              <div className="crm-row">
                <textarea
                  className="crm-textarea"
                  name="researchBasePrompt"
                  defaultValue={config.researchBasePrompt}
                  placeholder={lang === "sv" ? "Global grundprompt för research" : "Global base prompt for research"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  name="quickSimilarBasePrompt"
                  defaultValue={config.quickSimilarBasePrompt}
                  placeholder={lang === "sv" ? "Grundprompt för snabb liknande-kunder AI" : "Base prompt for quick similar-customers AI"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  name="quickSimilarExtraInstructions"
                  defaultValue={config.quickSimilarExtraInstructions}
                  placeholder={lang === "sv" ? "Extra instruktioner för snabb liknande-kunder AI" : "Extra instructions for quick similar-customers AI"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  name="extraInstructions"
                  defaultValue={config.extraInstructions}
                  placeholder={lang === "sv" ? "Extra AI-instruktioner" : "Extra AI instructions"}
                />
              </div>
            </section>

            <section style={{ display: settingsTab === "notifications" ? "block" : "none" }}>
              <div style={{ marginTop: "0.1rem" }}>
              <p className="crm-subtle">{lang === "sv" ? "Påminnelser och notifieringar" : "Reminders and notifications"}</p>
              <div className="crm-row" style={{ marginTop: "0.5rem" }}>
                <label className="crm-check">
                  <input type="checkbox" name="remindersEnabled" defaultChecked={config.remindersEnabled} />
                  <span>{lang === "sv" ? "Aktivera automatiska påminnelser" : "Enable automatic reminders"}</span>
                </label>
                <label className="crm-check">
                  <input type="checkbox" name="notifyViaSlack" defaultChecked={config.notifyViaSlack} />
                  <span>Slack</span>
                </label>
                <label className="crm-check">
                  <input type="checkbox" name="notifyViaEmail" defaultChecked={config.notifyViaEmail} />
                  <span>Gmail (SMTP)</span>
                </label>
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="reminderDaysBeforeDeadline"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={config.reminderDaysBeforeDeadline}
                  placeholder={lang === "sv" ? "Dagar före deadline" : "Days before deadline"}
                />
                <input
                  className="crm-input"
                  name="inactivityReminderDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={config.inactivityReminderDays}
                  placeholder={lang === "sv" ? "Dagar utan aktivitet" : "Days without activity"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  name="reminderRecipients"
                  defaultValue={config.reminderRecipients.join("\n")}
                  placeholder={lang === "sv" ? "E-postmottagare, en per rad" : "Reminder email recipients, one per line"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="slackWebhookUrl"
                  defaultValue={config.slackWebhookUrl}
                  placeholder={lang === "sv" ? "Slack webhook URL" : "Slack webhook URL"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="gmailFrom"
                  defaultValue={config.gmailFrom}
                  placeholder={lang === "sv" ? "Från-adress (Gmail)" : "From address (Gmail)"}
                />
                <input
                  className="crm-input"
                  name="gmailReplyTo"
                  defaultValue={config.gmailReplyTo}
                  placeholder={lang === "sv" ? "Reply-to (valfritt)" : "Reply-to (optional)"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <button
                  className="crm-button crm-button-secondary"
                  type="button"
                  onClick={runRemindersNow}
                  disabled={remindersRunning}
                >
                  {remindersRunning
                    ? (lang === "sv" ? "Kör..." : "Running...")
                    : (lang === "sv" ? "Kör påminnelser nu" : "Run reminders now")}
                </button>
              </div>
              {remindersStatus ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{remindersStatus}</p> : null}
            </div>
            </section>
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
