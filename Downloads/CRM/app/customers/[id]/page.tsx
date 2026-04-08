"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";

type Customer = {
  id: string;
  name: string;
  registrationNumber: string | null;
  naceCode: string | null;
  industry: string | null;
  country: string | null;
  region: string | null;
  seller: string | null;
  address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  potentialScore: number;
  status: string;
  updatedAt: string;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    department: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>;
  plans: Array<{
    id: string;
    title: string;
    description?: string | null;
    status: "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
    priority?: "LOW" | "MEDIUM" | "HIGH";
    startDate?: string | null;
    endDate?: string | null;
    owner: string | null;
  }>;
  webshopSignals?: {
    title?: string;
    description?: string;
    syncedAt?: string;
    research?: {
      assortmentFitScore?: number | null;
      fitScore?: number | null;
      confidence?: string | null;
      updatedAt?: string | null;
      updatedBy?: string | null;
    } | null;
    researchHistory?: Array<{
      id?: string;
      ranAt?: string;
      ranBy?: string | null;
      model?: string | null;
      summary?: string;
      commercialRelevance?: string;
      fitScore?: number | null;
      assortmentFitScore?: number | null;
      potentialScore?: number | null;
      totalScore?: number | null;
      confidence?: string | null;
      year1Potential?: { low?: string; base?: string; high?: string; currency?: string } | null;
      categoriesToPitch?: Array<{ categoryOrBrand?: string; whyItFits?: string; opportunityLevel?: string }> | null;
      nextBestActions?: string[] | null;
      rawOutput?: string | null;
    }> | null;
    manualBrandRevenue?: Array<{
      brand?: string;
      revenue?: number;
      currency?: string;
      year?: number;
      updatedAt?: string;
      updatedBy?: string | null;
    }> | null;
    extractedAutofill?: {
      registrationNumber?: string | null;
      naceCode?: string | null;
      industry?: string | null;
      region?: string | null;
      address?: string | null;
      website?: string | null;
    } | null;
  } | null;
};

type ManualBrandRevenueRow = {
  key: string;
  brand: string;
  revenue: string;
  currency: string;
  year: string;
};

type Activity = {
  id: string;
  type: "NOTE" | "CUSTOMER_UPDATED" | "PLAN_CREATED" | "PLAN_UPDATED" | "CONTACT_CREATED";
  message: string;
  actorName: string | null;
  createdAt: string;
  plan?: { id: string; title: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  metadata?: unknown;
};

type SalesResponse = {
  customerId: string;
  count: number;
  totals: {
    netSales: number;
    unitsSold: number;
    ordersCount: number;
    averageGrossMargin: number | null;
  };
  rows: Array<{
    id: string;
    source: string;
    periodStart: string;
    periodEnd: string;
    currency: string;
    netSales: number | null;
    grossMargin: number | null;
    unitsSold: number | null;
    ordersCount: number | null;
  }>;
};

type FormConfig = {
  industries: string[];
  countries: string[];
  regionsByCountry: Array<{ country: string; regions: string[] }>;
  sellers: string[];
  brands: string[];
  globalSystemPrompt: string;
  fullResearchPrompt: string;
  similarCustomersPrompt: string;
  followupCustomerClickPrompt: string;
  extraInstructions: string;
  quickSimilarExtraInstructions: string;
};

type CustomerRegionRow = {
  country: string | null;
  region: string | null;
};

const DEFAULT_FORM_CONFIG: FormConfig = {
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
  brands: [],
  globalSystemPrompt:
    "You are an account intelligence and channel sales analyst for Vendora Nordic.",
  fullResearchPrompt:
    "You are a senior GTM & Channel Analyst for Vendora Nordic.",
  similarCustomersPrompt:
    "Find up to 8 similar reseller customers based on this selected account. Use country/region scope first and fall back to country when needed. Prefer public company registers/directories and include confidence + source signals.",
  followupCustomerClickPrompt:
    "Deep-research this selected similar company for Vendora fit and commercial potential. Quantify likely Year-1 potential range, highlight top product families to pitch, and provide concrete next steps.",
  extraInstructions: "",
  quickSimilarExtraInstructions:
    "Keep the response short. Focus on similar profile in segment, geography and category focus."
};

const planStatusClass: Record<Customer["plans"][number]["status"], string> = {
  PLANNED: "",
  IN_PROGRESS: "in_progress",
  ON_HOLD: "on_hold",
  COMPLETED: "completed"
};

function buildOptionList(...lists: Array<Array<string | null | undefined> | undefined>): string[] {
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      const value = String(item ?? "").trim();
      if (!value) continue;
      seen.add(value);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

type ContactDraft = {
  key: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  title: string;
  notes: string;
};

type ModalPlanDraft = {
  id: string;
  title: string;
  description: string;
  owner: string;
  status: "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  startDate: string;
  endDate: string;
};

type SimilarCustomer = {
  id?: string;
  name: string;
  country: string | null;
  region: string | null;
  industry: string | null;
  seller: string | null;
  potentialScore: number;
  matchScore: number;
  website?: string | null;
  organizationNumber?: string | null;
  reason?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  confidence?: string | null;
  fitScore?: number | null;
  potentialScoreRaw?: number | null;
  totalScore?: number | null;
  alreadyCustomer?: boolean;
  existingCustomerId?: string | null;
  existingCustomerName?: string | null;
};

type ResearchApiResponse = {
  similarCustomers?: SimilarCustomer[];
  aiResult?: { outputText: string; model: string } | null;
  aiError?: string | null;
};

type MarkdownSection = {
  title: string;
  body: string;
};

type JsonMap = Record<string, unknown>;

type NormalizedProfileResearch = {
  phase1ResearchSummary: JsonMap;
  accountSummary: JsonMap;
  scorecard: JsonMap;
  growth: JsonMap;
  categories: JsonMap[];
  contactPaths: JsonMap;
  outreachPlaybook: JsonMap;
  dataQualityNotes: JsonMap;
  nextBestActions: string[];
  evidenceLog: JsonMap[];
};

type LookalikeRow = {
  rank: number;
  company: string;
  country: string;
  segment: string;
  fit: string;
  potential: string;
  total: string;
  confidence: string;
};

type ResearchHistoryRow = {
  id: string;
  ranAt: string;
  ranBy: string | null;
  model: string | null;
  summary: string;
  commercialRelevance: string;
  segmentChannelProfile: string[];
  fitScore: number | null;
  assortmentFitScore: number | null;
  potentialScore: number | null;
  totalScore: number | null;
  confidence: string | null;
  year1Low: string;
  year1Base: string;
  year1High: string;
  year1Currency: string;
  categories: Array<{ categoryOrBrand: string; whyItFits: string; opportunityLevel: string }>;
  scoreDrivers: string[];
  assumptions: string[];
  contactPaths: {
    namedContacts: Array<{ name: string; role: string; sourceNote: string; confidence: string }>;
    roleBasedPaths: Array<{ function: string; entryPath: string; confidence: string }>;
    fallbackPath: string;
  } | null;
  nextBestActions: string[];
  rawOutput: string;
  normalized: NormalizedProfileResearch | null;
  sourceAttribution: {
    web: Array<{ url: string; title: string | null; origins: string[] }>;
    externalSignals: Array<{ sourceType: string; url: string; title: string }>;
    contacts: Array<{
      name: string;
      role: string;
      sourceUrl: string;
      sourceType: string;
      confidence: string;
      verificationStatus: string;
    }>;
    crm: {
      contactsCount: number;
      plansCount: number;
      activitiesCount: number;
      salesRecordsCount: number;
      hasPriorResearch: boolean;
      customerUpdatedAt: string | null;
    } | null;
    discovery: { providers: string[]; seedCount: number } | null;
  } | null;
};

function asJsonMap(value: unknown): JsonMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonMap;
}

function asJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asScalarText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asTextArray(value: unknown): string[] {
  return asJsonArray(value).map((item) => asText(item)).filter(Boolean);
}

function parseJsonLoose(text: string): unknown {
  const source = String(text ?? "").trim();
  if (!source) return null;
  const attempts: string[] = [source];
  const fencedJson = source.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) attempts.push(fencedJson[1].trim());
  const fencedGeneric = source.match(/```\s*([\s\S]*?)```/i);
  if (fencedGeneric?.[1]) attempts.push(fencedGeneric[1].trim());

  const firstCurly = source.indexOf("{");
  const lastCurly = source.lastIndexOf("}");
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    attempts.push(source.slice(firstCurly, lastCurly + 1).trim());
  }

  const uniqAttempts = Array.from(new Set(attempts.map((item) => item.replace(/,\s*([}\]])/g, "$1").trim())));
  for (const attempt of uniqAttempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // keep trying
    }
  }
  return null;
}

function normalizeProfileResearchJson(root: JsonMap | null): NormalizedProfileResearch | null {
  if (!root) return null;
  const phase1ResearchSummary = asJsonMap(root.phase1_research_summary) ?? {};
  const accountSummary = asJsonMap(root.account_summary) ?? asJsonMap(root.target_account_summary) ?? {};
  const scorecard = asJsonMap(root.vendora_fit_scorecard) ?? asJsonMap(root.vendora_match_scorecard) ?? {};
  const growth = asJsonMap(root.growth_opportunities_for_vendora) ?? {};
  const categories = (asJsonArray(root.recommended_categories_to_pitch).length
    ? asJsonArray(root.recommended_categories_to_pitch)
    : asJsonArray(root.best_categories_to_pitch)
  )
    .map((row) => asJsonMap(row))
    .filter((row): row is JsonMap => Boolean(row));
  const contactPaths = asJsonMap(root.contact_paths) ?? {};
  const outreachPlaybook = asJsonMap(root.outreach_playbook) ?? {};
  const dataQualityNotes = asJsonMap(root.data_quality_notes) ?? {};
  const nextBestActions = asTextArray(root.next_best_actions);
  const evidenceLog = asJsonArray(root.evidence_log)
    .map((row) => asJsonMap(row))
    .filter((row): row is JsonMap => Boolean(row));

  const hasData =
    Object.keys(phase1ResearchSummary).length > 0 ||
    Object.keys(accountSummary).length > 0 ||
    Object.keys(scorecard).length > 0 ||
    Object.keys(growth).length > 0 ||
    categories.length > 0 ||
    Object.keys(contactPaths).length > 0 ||
    Object.keys(outreachPlaybook).length > 0 ||
    Object.keys(dataQualityNotes).length > 0 ||
    nextBestActions.length > 0 ||
    evidenceLog.length > 0;
  if (!hasData) return null;

  return {
    phase1ResearchSummary,
    accountSummary,
    scorecard,
    growth,
    categories,
    contactPaths,
    outreachPlaybook,
    dataQualityNotes,
    nextBestActions,
    evidenceLog
  };
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

function parseLookalikeTable(text: string): LookalikeRow[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.includes("|"));
  if (tableLines.length < 3) return [];

  const rows: LookalikeRow[] = [];
  let seenHeader = false;

  for (const line of tableLines) {
    if (/^\|?\s*-{2,}/.test(line)) continue;
    const cols = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cols.length < 8) continue;
    const normalized = cols.map((c) => c.toLowerCase());
    if (!seenHeader && normalized.some((c) => c === "company") && normalized.some((c) => c === "country")) {
      seenHeader = true;
      continue;
    }
    if (!seenHeader) continue;

    const rankNum = Number(cols[0]?.replace(/[^\d]/g, ""));
    const company = cols[1] ?? "";
    if (!company || Number.isNaN(rankNum)) continue;

    rows.push({
      rank: rankNum,
      company,
      country: cols[2] ?? "-",
      segment: cols[3] ?? "-",
      fit: cols[4] ?? "-",
      potential: cols[5] ?? "-",
      total: cols[6] ?? "-",
      confidence: cols[7] ?? "-"
    });
  }

  return rows.sort((a, b) => a.rank - b.rank);
}

function extractDrillCandidatesFromText(text: string, max = 30): string[] {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();

  const pushName = (value: string) => {
    const name = value.trim().replace(/^\d+\s*/, "");
    if (!name || name.length < 3 || name.length > 120) return;
    if (/^selected_account_scorecard/i.test(name) || /^lookalike_targets/i.test(name)) return;
    if (/^fitscore|^potentialscore|^totalscore|^year-1/i.test(name.toLowerCase())) return;
    if (!/[a-z]/i.test(name)) return;
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(name);
  };

  for (const line of lines) {
    if (out.length >= max) break;

    if (line.includes("|")) {
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      if (cells.length > 0) {
        const first = cells[0];
        if (first && !/company|företag|name|segment|country|region/i.test(first)) {
          pushName(first);
          continue;
        }
      }
    }

    if (/^[-*]\s+/.test(line)) {
      const bullet = line.replace(/^[-*]\s+/, "");
      const firstPart = bullet.split(/[|–—-]/)[0]?.trim() ?? "";
      pushName(firstPart);
      continue;
    }

    if (/^\d+[\.\)]\s+/.test(line)) {
      const numbered = line.replace(/^\d+[\.\)]\s+/, "");
      const firstPart = numbered.split(/[|–—-]/)[0]?.trim() ?? "";
      pushName(firstPart);
      continue;
    }

    const denseRow = line.match(/^(\d+)?\s*([A-Za-z0-9][A-Za-z0-9 .&'/-]{2,60})\s+(Sweden|Norway|Denmark|Finland|Estonia|Latvia|Lithuania|SE|NO|DK|FI|EE|LV|LT)\b/i);
    if (denseRow?.[2]) {
      pushName(denseRow[2]);
    }
  }

  return out.slice(0, max);
}

function emptyContactDraft(): ContactDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    email: "",
    phone: "",
    department: "",
    title: "",
    notes: ""
  };
}

function emptyManualBrandRevenueRow(): ManualBrandRevenueRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    brand: "",
    revenue: "",
    currency: "SEK",
    year: String(new Date().getUTCFullYear())
  };
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const salesSectionEnabled = process.env.NEXT_PUBLIC_FEATURE_SALES_SECTION === "true";
  const router = useRouter();
  const { lang } = useI18n();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "contacts" | "plans" | "activity" | "research">("overview");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [noteText, setNoteText] = useState("");
  const [activityStatus, setActivityStatus] = useState("");
  const [activitySaving, setActivitySaving] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [planStatus, setPlanStatus] = useState("");
  const [selectedPlanDraft, setSelectedPlanDraft] = useState<ModalPlanDraft | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [shareSlack, setShareSlack] = useState(true);
  const [shareEmail, setShareEmail] = useState(false);
  const [shareRecipients, setShareRecipients] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [activityFollowupText, setActivityFollowupText] = useState("");
  const [status, setStatus] = useState<string>("");
  const [contactStatus, setContactStatus] = useState<string>("");
  const [contactsSaving, setContactsSaving] = useState(false);
  const [newContacts, setNewContacts] = useState<ContactDraft[]>([emptyContactDraft()]);
  const [salesData, setSalesData] = useState<SalesResponse | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarStatus, setSimilarStatus] = useState("");
  const [similarResults, setSimilarResults] = useState<SimilarCustomer[]>([]);
  const [similarSortBy, setSimilarSortBy] = useState<"fit" | "country" | "region" | "confidence">("fit");
  const [similarSortDir, setSimilarSortDir] = useState<"asc" | "desc">("desc");
  const [hideExistingInSimilar, setHideExistingInSimilar] = useState(true);
  const [similarScopeUsed, setSimilarScopeUsed] = useState<"region" | "country" | null>(null);
  const [selectedSimilar, setSelectedSimilar] = useState<SimilarCustomer | null>(null);
  const [selectedSimilarResearch, setSelectedSimilarResearch] = useState("");
  const [selectedSimilarResearchError, setSelectedSimilarResearchError] = useState("");
  const [selectedSimilarResearchLoading, setSelectedSimilarResearchLoading] = useState(false);
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
  const [regionsByCountry, setRegionsByCountry] = useState<Record<string, string[]>>({});
  const [allRegions, setAllRegions] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [selectedResearchArchiveYear, setSelectedResearchArchiveYear] = useState<string>("");
  const [manualBrandRevenueRows, setManualBrandRevenueRows] = useState<ManualBrandRevenueRow[]>([
    emptyManualBrandRevenueRow()
  ]);
  const [loading, setLoading] = useState(true);

  async function loadCustomer() {
    setLoading(true);
    setStatus("");

    const res = await fetch(`/api/customers/${params.id}`, { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      setStatus(lang === "sv" ? "Kunde inte läsa kund" : "Could not load customer");
      return;
    }

    const data = (await res.json()) as Customer;
    setCustomer(data);
    setSelectedCountry(data.country ?? "");
    const manualRows = (Array.isArray(data.webshopSignals?.manualBrandRevenue)
      ? data.webshopSignals?.manualBrandRevenue
      : []
    )
      .map((row) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        brand: String(row?.brand ?? "").trim(),
        revenue:
          typeof row?.revenue === "number" && Number.isFinite(row.revenue)
            ? String(Number(row.revenue.toFixed(2)))
            : "",
        currency: String(row?.currency ?? "SEK").trim().toUpperCase() || "SEK",
        year: Number.isFinite(Number(row?.year))
          ? String(Math.round(Number(row?.year)))
          : String(new Date().getUTCFullYear())
      }))
      .filter((row) => row.brand || row.revenue);
    setManualBrandRevenueRows(manualRows.length > 0 ? manualRows : [emptyManualBrandRevenueRow()]);
    setLoading(false);
  }

  async function loadFormOptions() {
    try {
      const [settingsRes, customersRes] = await Promise.all([
        fetch("/api/admin/settings", { cache: "no-store" }),
        fetch("/api/customers?sort=name_asc", { cache: "no-store" })
      ]);

      if (settingsRes.ok) {
        const data = (await settingsRes.json()) as { config?: FormConfig };
        if (data.config) {
          const settingsRegionMap: Record<string, string[]> = Array.isArray(data.config.regionsByCountry)
            ? Object.fromEntries(
                data.config.regionsByCountry
                  .map((entry) => [
                    String(entry.country ?? "").trim().toUpperCase(),
                    buildOptionList(Array.isArray(entry.regions) ? entry.regions : [])
                  ])
                  .filter(([country, regions]) => country && regions.length > 0)
              )
            : {};

          setFormConfig({
            industries: Array.isArray(data.config.industries) ? data.config.industries : DEFAULT_FORM_CONFIG.industries,
            countries: Array.isArray(data.config.countries) ? data.config.countries : DEFAULT_FORM_CONFIG.countries,
            regionsByCountry: Array.isArray(data.config.regionsByCountry)
              ? data.config.regionsByCountry
              : DEFAULT_FORM_CONFIG.regionsByCountry,
            sellers: Array.isArray(data.config.sellers) ? data.config.sellers : DEFAULT_FORM_CONFIG.sellers,
            brands: Array.isArray(data.config.brands) ? data.config.brands : DEFAULT_FORM_CONFIG.brands,
            globalSystemPrompt:
              typeof (data.config as { globalSystemPrompt?: string }).globalSystemPrompt === "string"
                ? String((data.config as { globalSystemPrompt?: string }).globalSystemPrompt)
                : DEFAULT_FORM_CONFIG.globalSystemPrompt,
            fullResearchPrompt:
              typeof (data.config as { fullResearchPrompt?: string; researchBasePrompt?: string }).fullResearchPrompt === "string" &&
              (data.config as { fullResearchPrompt?: string }).fullResearchPrompt?.trim()
                ? String((data.config as { fullResearchPrompt?: string }).fullResearchPrompt)
                : typeof (data.config as { researchBasePrompt?: string }).researchBasePrompt === "string" &&
                  (data.config as { researchBasePrompt?: string }).researchBasePrompt?.trim()
                ? String((data.config as { researchBasePrompt?: string }).researchBasePrompt)
                : DEFAULT_FORM_CONFIG.fullResearchPrompt,
            similarCustomersPrompt:
              typeof (data.config as { similarCustomersPrompt?: string; quickSimilarQuestionPrompt?: string }).similarCustomersPrompt === "string" &&
              (data.config as { similarCustomersPrompt?: string }).similarCustomersPrompt?.trim()
                ? String((data.config as { similarCustomersPrompt?: string }).similarCustomersPrompt)
                : typeof (data.config as { quickSimilarQuestionPrompt?: string }).quickSimilarQuestionPrompt === "string" &&
                  (data.config as { quickSimilarQuestionPrompt?: string }).quickSimilarQuestionPrompt?.trim()
                ? String((data.config as { quickSimilarQuestionPrompt?: string }).quickSimilarQuestionPrompt)
                : DEFAULT_FORM_CONFIG.similarCustomersPrompt,
            followupCustomerClickPrompt:
              typeof (
                data.config as { followupCustomerClickPrompt?: string; quickSimilarFollowupPrompt?: string }
              ).followupCustomerClickPrompt === "string" &&
              (data.config as { followupCustomerClickPrompt?: string }).followupCustomerClickPrompt?.trim()
                ? String((data.config as { followupCustomerClickPrompt?: string }).followupCustomerClickPrompt)
                : typeof (data.config as { quickSimilarFollowupPrompt?: string }).quickSimilarFollowupPrompt === "string" &&
                  (data.config as { quickSimilarFollowupPrompt?: string }).quickSimilarFollowupPrompt?.trim()
                ? String((data.config as { quickSimilarFollowupPrompt?: string }).quickSimilarFollowupPrompt)
                : DEFAULT_FORM_CONFIG.followupCustomerClickPrompt,
            extraInstructions:
              typeof (data.config as { extraInstructions?: string }).extraInstructions === "string"
                ? String((data.config as { extraInstructions?: string }).extraInstructions)
                : DEFAULT_FORM_CONFIG.extraInstructions,
            quickSimilarExtraInstructions:
              typeof data.config.quickSimilarExtraInstructions === "string"
                ? data.config.quickSimilarExtraInstructions
                : DEFAULT_FORM_CONFIG.quickSimilarExtraInstructions
          });
          if (Object.keys(settingsRegionMap).length > 0) {
            setRegionsByCountry((prev) => ({ ...settingsRegionMap, ...prev }));
            setAllRegions(buildOptionList(...Object.values(settingsRegionMap)));
          }
        }
      }

      if (customersRes.ok) {
        const rows = (await customersRes.json()) as CustomerRegionRow[];
        const nextRegionsByCountry: Record<string, string[]> = {};
        const regionPool: string[] = [];

        for (const row of rows) {
          const country = String(row.country ?? "").trim();
          const region = String(row.region ?? "").trim();
          if (!region) continue;
          regionPool.push(region);
          if (!country) continue;
          if (!nextRegionsByCountry[country]) nextRegionsByCountry[country] = [];
          nextRegionsByCountry[country].push(region);
        }

        for (const [country, regions] of Object.entries(nextRegionsByCountry)) {
          nextRegionsByCountry[country] = buildOptionList(regions);
        }

        setRegionsByCountry(nextRegionsByCountry);
        setAllRegions(buildOptionList(regionPool));
      }
    } catch {
      // Keep defaults
    }
  }

  async function loadCurrentUser() {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { email?: string };
      if (data.email) setCurrentUserEmail(data.email);
    } catch {
      // no-op
    }
  }

  async function loadActivities() {
    const res = await fetch(`/api/customers/${params.id}/activities`, { cache: "no-store" });
    if (!res.ok) return;
    setActivities((await res.json()) as Activity[]);
  }

  async function loadSales() {
    if (!salesSectionEnabled) return;
    setSalesLoading(true);
    setSalesError("");
    try {
      const res = await fetch(`/api/customers/${params.id}/sales?limit=12`, { cache: "no-store" });
      if (!res.ok) {
        setSalesError(lang === "sv" ? "Kunde inte läsa försäljning." : "Could not load sales.");
        setSalesLoading(false);
        return;
      }
      setSalesData((await res.json()) as SalesResponse);
    } catch {
      setSalesError(lang === "sv" ? "Kunde inte läsa försäljning." : "Could not load sales.");
    } finally {
      setSalesLoading(false);
    }
  }

  useEffect(() => {
    loadCustomer();
    loadFormOptions();
    loadActivities();
    loadSales();
    loadCurrentUser();
  }, [params.id, lang]);

  const industryOptions = buildOptionList(formConfig.industries, [customer?.industry]);
  const countryOptions = buildOptionList(formConfig.countries, [customer?.country]);
  const sellerOptions = buildOptionList(formConfig.sellers, [customer?.seller]);
  const settingsRegionMap: Record<string, string[]> = Object.fromEntries(
    formConfig.regionsByCountry
      .map((entry) => [
        String(entry.country ?? "").trim().toUpperCase(),
        buildOptionList(Array.isArray(entry.regions) ? entry.regions : [])
      ])
      .filter(([country, regions]) => country && regions.length > 0)
  );
  const regionMap = Object.keys(settingsRegionMap).length ? settingsRegionMap : regionsByCountry;
  const scopedRegionOptions = selectedCountry ? regionsByCountry[selectedCountry] ?? [] : allRegions;
  const regionOptionsFromMap = selectedCountry ? regionMap[selectedCountry] ?? [] : buildOptionList(...Object.values(regionMap));
  const regionOptions = buildOptionList(regionOptionsFromMap.length ? regionOptionsFromMap : scopedRegionOptions, [customer?.region]);
  const latestCustomerUpdate = activities.find((activity) => activity.type === "CUSTOMER_UPDATED");
  const lastSavedBy = latestCustomerUpdate?.actorName || currentUserEmail || "-";
  const savedAtText = customer
    ? new Date(customer.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "--:--";
  const assortmentFitScore =
    typeof customer?.webshopSignals?.research?.assortmentFitScore === "number"
      ? customer.webshopSignals?.research?.assortmentFitScore
      : typeof customer?.webshopSignals?.research?.fitScore === "number"
      ? customer.webshopSignals?.research?.fitScore
      : null;
  const researchHistory: ResearchHistoryRow[] = (
    Array.isArray(customer?.webshopSignals?.researchHistory) ? customer?.webshopSignals?.researchHistory : []
  )
    .map((raw, index) => {
      const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
      if (!row) return null;
      const year1 = row.year1Potential && typeof row.year1Potential === "object"
        ? (row.year1Potential as Record<string, unknown>)
        : null;
      const categories = Array.isArray(row.categoriesToPitch) ? row.categoriesToPitch : [];
      const nextBestActions = Array.isArray(row.nextBestActions) ? row.nextBestActions : [];
      const scoreDrivers = Array.isArray(row.scoreDrivers) ? row.scoreDrivers : [];
      const assumptions = Array.isArray(row.assumptions) ? row.assumptions : [];
      const segmentChannelProfile = Array.isArray(row.segmentChannelProfile) ? row.segmentChannelProfile : [];
      const contactPathsRaw = row.contactPaths && typeof row.contactPaths === "object"
        ? (row.contactPaths as Record<string, unknown>)
        : null;
      const sourceAttributionRaw = row.sourceAttribution && typeof row.sourceAttribution === "object"
        ? (row.sourceAttribution as Record<string, unknown>)
        : null;
      const sourceWeb = Array.isArray(sourceAttributionRaw?.web) ? sourceAttributionRaw.web : [];
      const sourceExternalSignals = Array.isArray(sourceAttributionRaw?.externalSignals)
        ? sourceAttributionRaw.externalSignals
        : [];
      const sourceContacts = Array.isArray(sourceAttributionRaw?.contacts) ? sourceAttributionRaw.contacts : [];
      const sourceCrm = sourceAttributionRaw?.crm && typeof sourceAttributionRaw.crm === "object"
        ? (sourceAttributionRaw.crm as Record<string, unknown>)
        : null;
      const sourceDiscovery = sourceAttributionRaw?.discovery && typeof sourceAttributionRaw.discovery === "object"
        ? (sourceAttributionRaw.discovery as Record<string, unknown>)
        : null;
      const ranAt =
        typeof row.ranAt === "string" && row.ranAt.trim()
          ? row.ranAt
          : customer?.updatedAt || new Date().toISOString();
      const rawOutput = typeof row.rawOutput === "string" ? row.rawOutput : "";
      const parsedRawOutput = normalizeProfileResearchJson(asJsonMap(parseJsonLoose(rawOutput)));
      return {
        id: typeof row.id === "string" && row.id.trim() ? row.id : `research-${index}`,
        ranAt,
        ranBy: typeof row.ranBy === "string" && row.ranBy.trim() ? row.ranBy : null,
        model: typeof row.model === "string" && row.model.trim() ? row.model : null,
        summary: typeof row.summary === "string" ? row.summary : "",
        commercialRelevance: typeof row.commercialRelevance === "string" ? row.commercialRelevance : "",
        fitScore: typeof row.fitScore === "number" ? row.fitScore : null,
        assortmentFitScore: typeof row.assortmentFitScore === "number" ? row.assortmentFitScore : null,
        potentialScore: typeof row.potentialScore === "number" ? row.potentialScore : null,
        totalScore: typeof row.totalScore === "number" ? row.totalScore : null,
        confidence: typeof row.confidence === "string" && row.confidence.trim() ? row.confidence : null,
        year1Low: typeof year1?.low === "string" ? year1.low : "",
        year1Base: typeof year1?.base === "string" ? year1.base : "",
        year1High: typeof year1?.high === "string" ? year1.high : "",
        year1Currency: typeof year1?.currency === "string" ? year1.currency : "SEK",
        categories: categories
          .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .map((item) => ({
            categoryOrBrand: typeof item.categoryOrBrand === "string" ? item.categoryOrBrand : "",
            whyItFits: typeof item.whyItFits === "string" ? item.whyItFits : "",
            opportunityLevel: typeof item.opportunityLevel === "string" ? item.opportunityLevel : ""
          }))
          .filter((item) => item.categoryOrBrand),
        segmentChannelProfile: segmentChannelProfile
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean),
        scoreDrivers: scoreDrivers
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean),
        assumptions: assumptions
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean),
        contactPaths: contactPathsRaw
          ? {
              namedContacts: (Array.isArray(contactPathsRaw.namedContacts) ? contactPathsRaw.namedContacts : [])
                .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
                .filter((c): c is Record<string, unknown> => Boolean(c))
                .map((c) => ({
                  name: typeof c.name === "string" ? c.name : "",
                  role: typeof c.role === "string" ? c.role : "",
                  sourceNote: typeof c.sourceNote === "string" ? c.sourceNote : "",
                  confidence: typeof c.confidence === "string" ? c.confidence : "Low"
                }))
                .filter((c) => c.name || c.role),
              roleBasedPaths: (Array.isArray(contactPathsRaw.roleBasedPaths) ? contactPathsRaw.roleBasedPaths : [])
                .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
                .filter((p): p is Record<string, unknown> => Boolean(p))
                .map((p) => ({
                  function: typeof p.function === "string" ? p.function : "",
                  entryPath: typeof p.entryPath === "string" ? p.entryPath : "",
                  confidence: typeof p.confidence === "string" ? p.confidence : "Low"
                }))
                .filter((p) => p.function || p.entryPath),
              fallbackPath: typeof contactPathsRaw.fallbackPath === "string" ? contactPathsRaw.fallbackPath : ""
            }
          : null,
        nextBestActions: nextBestActions
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean),
        rawOutput,
        normalized: parsedRawOutput,
        sourceAttribution: sourceAttributionRaw
          ? {
              web: sourceWeb
                .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
                .filter((item): item is Record<string, unknown> => Boolean(item))
                .map((item) => ({
                  url: typeof item.url === "string" ? item.url : "",
                  title: typeof item.title === "string" ? item.title : null,
                  origins: Array.isArray(item.origins)
                    ? item.origins.map((origin) => String(origin)).filter(Boolean)
                    : []
                }))
                .filter((item) => item.url),
              externalSignals: sourceExternalSignals
                .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
                .filter((item): item is Record<string, unknown> => Boolean(item))
                .map((item) => ({
                  sourceType: typeof item.sourceType === "string" ? item.sourceType : "external",
                  url: typeof item.url === "string" ? item.url : "",
                  title: typeof item.title === "string" ? item.title : ""
                }))
                .filter((item) => item.url || item.title),
              contacts: sourceContacts
                .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
                .filter((item): item is Record<string, unknown> => Boolean(item))
                .map((item) => ({
                  name: typeof item.name === "string" ? item.name : "",
                  role: typeof item.role === "string" ? item.role : "",
                  sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : "",
                  sourceType: typeof item.sourceType === "string" ? item.sourceType : "external",
                  confidence: typeof item.confidence === "string" ? item.confidence : "",
                  verificationStatus: typeof item.verificationStatus === "string" ? item.verificationStatus : "NeedsValidation"
                }))
                .filter((item) => item.name || item.sourceUrl || item.role),
              crm: sourceCrm
                ? {
                    contactsCount: Number(sourceCrm.contactsCount ?? 0),
                    plansCount: Number(sourceCrm.plansCount ?? 0),
                    activitiesCount: Number(sourceCrm.activitiesCount ?? 0),
                    salesRecordsCount: Number(sourceCrm.salesRecordsCount ?? 0),
                    hasPriorResearch: Boolean(sourceCrm.hasPriorResearch),
                    customerUpdatedAt: typeof sourceCrm.customerUpdatedAt === "string" ? sourceCrm.customerUpdatedAt : null
                  }
                : null,
              discovery: sourceDiscovery
                ? {
                    providers: Array.isArray(sourceDiscovery.providers)
                      ? sourceDiscovery.providers.map((provider) => String(provider)).filter(Boolean)
                      : [],
                    seedCount: Number(sourceDiscovery.seedCount ?? 0)
                  }
                : null
            }
          : null
      } satisfies ResearchHistoryRow;
    })
    .filter((row): row is ResearchHistoryRow => Boolean(row))
    .sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime());
  const latestResearchEntry = researchHistory[0] ?? null;
  const archivedResearchByYear = useMemo(() => {
    const rows = researchHistory.slice(1);
    const byYear = new Map<string, ResearchHistoryRow>();
    for (const entry of rows) {
      const yearValue = new Date(entry.ranAt).getFullYear();
      const yearKey = Number.isFinite(yearValue) ? String(yearValue) : "Unknown";
      if (!byYear.has(yearKey)) byYear.set(yearKey, entry);
    }
    return Array.from(byYear.entries())
      .map(([year, entry]) => ({ year, entry }))
      .sort((a, b) => Number(b.year) - Number(a.year));
  }, [researchHistory]);
  useEffect(() => {
    if (archivedResearchByYear.length === 0) {
      if (selectedResearchArchiveYear) setSelectedResearchArchiveYear("");
      return;
    }
    if (!archivedResearchByYear.some((item) => item.year === selectedResearchArchiveYear)) {
      setSelectedResearchArchiveYear(archivedResearchByYear[0].year);
    }
  }, [archivedResearchByYear, selectedResearchArchiveYear]);
  const selectedArchivedResearch = useMemo(
    () => archivedResearchByYear.find((item) => item.year === selectedResearchArchiveYear)?.entry ?? null,
    [archivedResearchByYear, selectedResearchArchiveYear]
  );
  const visibleResearchEntries = useMemo(() => {
    const rows: ResearchHistoryRow[] = [];
    if (latestResearchEntry) rows.push(latestResearchEntry);
    if (selectedArchivedResearch && (!latestResearchEntry || selectedArchivedResearch.id !== latestResearchEntry.id)) {
      rows.push(selectedArchivedResearch);
    }
    return rows;
  }, [latestResearchEntry, selectedArchivedResearch]);
  const latestResearchId = latestResearchEntry?.id ?? null;
  const manualBrandRevenueTotal = useMemo(() => {
    return manualBrandRevenueRows.reduce((sum, row) => {
      const value = Number(row.revenue);
      return Number.isFinite(value) && value >= 0 ? sum + value : sum;
    }, 0);
  }, [manualBrandRevenueRows]);
  const confidenceRank = (value: string | null | undefined) => {
    const v = String(value ?? "").toLowerCase();
    if (v.startsWith("high")) return 3;
    if (v.startsWith("med")) return 2;
    if (v.startsWith("low")) return 1;
    return 0;
  };
  const sortedSimilarResults = [...similarResults].sort((a, b) => {
    const dir = similarSortDir === "asc" ? 1 : -1;
    if (similarSortBy === "country") return dir * String(a.country ?? "").localeCompare(String(b.country ?? ""));
    if (similarSortBy === "region") return dir * String(a.region ?? "").localeCompare(String(b.region ?? ""));
    if (similarSortBy === "confidence") return dir * (confidenceRank(a.confidence) - confidenceRank(b.confidence));
    const fitA = Number(a.fitScore ?? a.matchScore ?? 0);
    const fitB = Number(b.fitScore ?? b.matchScore ?? 0);
    return dir * (fitA - fitB);
  });
  const visibleSimilarResults = sortedSimilarResults.filter((row) => (hideExistingInSimilar ? !row.alreadyCustomer : true));
  const similarResearchSections = parseMarkdownSections(selectedSimilarResearch);

  const planStatusLabel = (status: Customer["plans"][number]["status"]) =>
    status === "PLANNED"
      ? (lang === "sv" ? "Planerad" : "Planned")
      : status === "IN_PROGRESS"
      ? (lang === "sv" ? "Pågående" : "In progress")
      : status === "ON_HOLD"
      ? (lang === "sv" ? "Pausad" : "On hold")
      : (lang === "sv" ? "Avslutad" : "Completed");

  function closeItemModal() {
    setSelectedPlanDraft(null);
    setSelectedActivity(null);
    setShareStatus("");
    setShareNote("");
    setActivityFollowupText("");
  }

  function openPlanModal(plan: Customer["plans"][number]) {
    setSelectedActivity(null);
    setShareStatus("");
    setShareNote("");
    setSelectedPlanDraft({
      id: plan.id,
      title: plan.title,
      description: plan.description || "",
      owner: plan.owner || "",
      status: plan.status,
      priority: (plan.priority || "MEDIUM") as "LOW" | "MEDIUM" | "HIGH",
      startDate: plan.startDate ? plan.startDate.slice(0, 10) : "",
      endDate: plan.endDate ? plan.endDate.slice(0, 10) : ""
    });
  }

  function openActivityModal(activity: Activity) {
    setSelectedPlanDraft(null);
    setShareStatus("");
    setShareNote("");
    setSelectedActivity(activity);
  }

  async function savePlanFromModal() {
    if (!selectedPlanDraft) return;
    setModalSaving(true);
    setShareStatus("");
    try {
      const res = await fetch(`/api/plans/${selectedPlanDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedPlanDraft.title.trim(),
          description: selectedPlanDraft.description.trim() || null,
          owner: selectedPlanDraft.owner.trim() || null,
          status: selectedPlanDraft.status,
          priority: selectedPlanDraft.priority,
          startDate: selectedPlanDraft.startDate || null,
          endDate: selectedPlanDraft.endDate || null
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte uppdatera plan." : "Could not update plan."));
      }
      setPlanStatus(lang === "sv" ? "Plan uppdaterad." : "Plan updated.");
      await loadCustomer();
      await loadActivities();
      closeItemModal();
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte uppdatera plan." : "Could not update plan."));
    } finally {
      setModalSaving(false);
    }
  }

  async function shareCurrentItem() {
    if (!selectedPlanDraft && !selectedActivity) return;
    setShareSaving(true);
    setShareStatus("");
    try {
      const payload = selectedPlanDraft
        ? {
            targetType: "plan" as const,
            targetId: selectedPlanDraft.id,
            channels: { slack: shareSlack, email: shareEmail },
            recipients: shareRecipients.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
            note: shareNote.trim() || undefined
          }
        : {
            targetType: "activity" as const,
            targetId: selectedActivity!.id,
            channels: { slack: shareSlack, email: shareEmail },
            recipients: shareRecipients.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
            note: shareNote.trim() || undefined
          };

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte dela." : "Could not share."));
      }
      setShareStatus(lang === "sv" ? "Delat." : "Shared.");
      await loadActivities();
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte dela." : "Could not share."));
    } finally {
      setShareSaving(false);
    }
  }

  async function addActivityFollowupFromModal() {
    if (!selectedActivity || !activityFollowupText.trim()) return;
    setModalSaving(true);
    setShareStatus("");
    try {
      const res = await fetch(`/api/customers/${params.id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `[Follow-up to ${selectedActivity.type}] ${activityFollowupText.trim()}`,
          actorName: currentUserEmail || "CRM user"
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte spara uppföljning." : "Could not save follow-up."));
      }
      setActivityFollowupText("");
      await loadActivities();
      setShareStatus(lang === "sv" ? "Uppföljning sparad." : "Follow-up saved.");
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte spara uppföljning." : "Could not save follow-up."));
    } finally {
      setModalSaving(false);
    }
  }

  function updateManualBrandRevenueRow(
    key: string,
    patch: Partial<Pick<ManualBrandRevenueRow, "brand" | "revenue" | "currency" | "year">>
  ) {
    setManualBrandRevenueRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function addManualBrandRevenueRow() {
    setManualBrandRevenueRows((prev) => [emptyManualBrandRevenueRow(), ...prev]);
  }

  function removeManualBrandRevenueRow(key: string) {
    const confirmed = window.confirm(
      lang === "sv" ? "Ta bort den här raden?" : "Remove this row?"
    );
    if (!confirmed) return;
    setManualBrandRevenueRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length > 0 ? next : [emptyManualBrandRevenueRow()];
    });
  }

  async function saveBrandRows() {
    const manualBrandRevenue = manualBrandRevenueRows
      .map((row) => ({
        brand: row.brand.trim(),
        revenue: Number(row.revenue),
        currency: row.currency.trim().toUpperCase() || "SEK",
        year: Number(row.year)
      }))
      .filter((row) => row.brand && Number.isFinite(row.revenue) && row.revenue >= 0);

    const res = await fetch(`/api/customers/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualBrandRevenue })
    });
    if (!res.ok) {
      setStatus(lang === "sv" ? "Kunde inte spara" : "Could not save");
      return;
    }
    setStatus(lang === "sv" ? "Sparat" : "Saved");
    await loadCustomer();
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const manualBrandRevenue = manualBrandRevenueRows
      .map((row) => ({
        brand: row.brand.trim(),
        revenue: Number(row.revenue),
        currency: row.currency.trim().toUpperCase() || "SEK",
        year: Number(row.year)
      }))
      .filter((row) => row.brand && Number.isFinite(row.revenue) && row.revenue >= 0);

    const res = await fetch(`/api/customers/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        registrationNumber: form.get("registrationNumber"),
        naceCode: form.get("naceCode"),
        industry: form.get("industry"),
        country: form.get("country"),
        region: form.get("region"),
        seller: form.get("seller"),
        address: form.get("address"),
        website: form.get("website"),
        notes: form.get("notes"),
        potentialScore: Number(form.get("potentialScore") || 50),
        manualBrandRevenue
      })
    });

    if (!res.ok) {
      setStatus(lang === "sv" ? "Kunde inte spara" : "Could not save");
      return;
    }

    setStatus(lang === "sv" ? "Sparat" : "Saved");
    await loadCustomer();
    router.push("/");

    // Merge any new brands into admin settings so they appear in the dropdown next time
    const newBrands = manualBrandRevenue.map((r) => r.brand).filter((b) => b && !formConfig.brands.includes(b));
    if (newBrands.length > 0) {
      fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brands: newBrands })
      })
        .then((r) => r.json())
        .then((data: { config?: { brands?: string[] } }) => {
          if (data.config?.brands) {
            setFormConfig((prev) => ({ ...prev, brands: data.config!.brands! }));
          }
        })
        .catch(() => {/* non-critical */});
    }
  }

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteCustomer() {
    const confirmed = window.confirm(
      lang === "sv"
        ? `Är du säker på att du vill ta bort ${customer?.name}? Alla kontakter och planer raderas permanent.`
        : `Are you sure you want to delete ${customer?.name}? All contacts and plans will be permanently removed.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/customers/${params.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setDeleteError(data.error ?? (lang === "sv" ? "Kunde inte ta bort" : "Could not delete"));
        return;
      }
      window.location.href = "/";
    } catch {
      setDeleteError(lang === "sv" ? "Något gick fel" : "Something went wrong");
    } finally {
      setDeleting(false);
    }
  }

  async function runSimilarSearch() {
    setSimilarLoading(true);
    setSimilarStatus(lang === "sv" ? "AI arbetar med att hitta liknande kunder..." : "AI is finding similar customers...");
    setSelectedSimilar(null);
    setSelectedSimilarResearch("");
    setSelectedSimilarResearchError("");

    const initialScope: "region" | "country" = customer?.region ? "region" : "country";

    const callResearch = async (scope: "region" | "country") => {
      const res = await fetch("/api/research", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: params.id,
          scope,
          maxSimilar: 500,
          externalOnly: true,
          allowCrmFallback: false,
          basePrompt:
            formConfig.similarCustomersPrompt ||
            DEFAULT_FORM_CONFIG.similarCustomersPrompt,
          extraInstructions: formConfig.quickSimilarExtraInstructions || DEFAULT_FORM_CONFIG.quickSimilarExtraInstructions
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte köra AI-sökning." : "Could not run AI search."));
      }
      return (await res.json()) as ResearchApiResponse;
    };

    try {
      const first = await callResearch(initialScope);
      let rows = first.similarCustomers ?? [];
      let scopeUsed: "region" | "country" = initialScope;
      let aiError = first.aiError ?? null;
      let aiOutput = first.aiResult?.outputText ?? "";

      if (rows.length === 0 && initialScope === "region" && customer?.country) {
        const fallback = await callResearch("country");
        rows = fallback.similarCustomers ?? [];
        scopeUsed = "country";
        aiError = fallback.aiError ?? aiError;
        aiOutput = fallback.aiResult?.outputText ?? aiOutput;
      }

      if (rows.length === 0 && aiOutput.trim()) {
        const fallbackFromTable = parseLookalikeTable(aiOutput).map((row) => ({
          id: `ai-fallback-${row.rank}-${row.company.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: row.company,
          country: row.country || customer?.country || null,
          region: customer?.region ?? null,
          industry: customer?.industry ?? null,
          seller: null,
          potentialScore: Number(row.potential) || 50,
          matchScore: Number(row.total) || Number(row.fit) || 50,
          fitScore: Number(row.fit) || null,
          potentialScoreRaw: Number(row.potential) || null,
          totalScore: Number(row.total) || null,
          confidence: row.confidence?.toLowerCase() || "low",
          sourceType: "ai-chat-table",
          alreadyCustomer: false
        } satisfies SimilarCustomer));
        if (fallbackFromTable.length > 0) {
          rows = fallbackFromTable;
        } else {
          const fallbackNames = extractDrillCandidatesFromText(aiOutput, 50);
          if (fallbackNames.length > 0) {
            rows = fallbackNames.map((name, index) => ({
              id: `ai-name-${index}-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
              name,
              country: customer?.country ?? null,
              region: customer?.region ?? null,
              industry: customer?.industry ?? null,
              seller: null,
              potentialScore: 50,
              matchScore: 50,
              confidence: "low",
              sourceType: "ai-chat",
              alreadyCustomer: false
            }));
          }
        }
      }

      setSimilarResults(rows);
      setSimilarScopeUsed(scopeUsed);

      const topMatches = rows.slice(0, 3).map((item) => item.name).join(", ");
      if (rows.length === 0 && aiError) {
        setSimilarStatus(
          lang === "sv"
            ? `AI returnerade inga kandidater (${scopeUsed === "region" ? "region" : "land"}). Fel: ${aiError}`
            : `AI returned no candidates (${scopeUsed}). Error: ${aiError}`
        );
      } else {
        setSimilarStatus(
          lang === "sv"
            ? `Hittade ${rows.length} liknande kunder (${scopeUsed === "region" ? "region" : "land"}). ${topMatches || ""}`.trim()
            : `Found ${rows.length} similar customers (${scopeUsed}). ${topMatches || ""}`.trim()
        );
      }
    } catch (error) {
      setSimilarResults([]);
      setSimilarScopeUsed(null);
      setSimilarStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte köra AI-sökning." : "Could not run AI search."));
    } finally {
      setSimilarLoading(false);
    }
  }

  async function runDeepResearchForSimilar(candidate: SimilarCustomer) {
    setSelectedSimilar(candidate);
    setSelectedSimilarResearch("");
    setSelectedSimilarResearchError("");
    setSelectedSimilarResearchLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId:
            candidate.existingCustomerId ||
            (candidate.id && !candidate.id.startsWith("external-") ? candidate.id : undefined),
          companyName: candidate.name,
          country: candidate.country ?? undefined,
          region: candidate.region ?? undefined,
          industry: candidate.industry ?? undefined,
          websites: candidate.website ? [candidate.website] : [],
          externalOnly: true,
          externalMode: "profile",
          scope: "country",
          maxSimilar: 10,
          basePrompt:
            formConfig.followupCustomerClickPrompt ||
            formConfig.fullResearchPrompt ||
            DEFAULT_FORM_CONFIG.followupCustomerClickPrompt,
          extraInstructions: formConfig.extraInstructions || DEFAULT_FORM_CONFIG.extraInstructions
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte köra full research." : "Could not run full research."));
      }
      const data = (await res.json()) as ResearchApiResponse;
      if (data.aiError) {
        setSelectedSimilarResearchError(data.aiError);
      }
      setSelectedSimilarResearch(data.aiResult?.outputText ?? "");
    } catch (error) {
      setSelectedSimilarResearchError(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte köra full research." : "Could not run full research."));
    } finally {
      setSelectedSimilarResearchLoading(false);
    }
  }

  function updateNewContact(index: number, field: keyof Omit<ContactDraft, "key">, value: string) {
    setNewContacts((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return { ...item, [field]: value };
      })
    );
  }

  function addContactDraft() {
    setNewContacts((prev) => [...prev, emptyContactDraft()]);
  }

  async function saveContacts() {
    setContactsSaving(true);
    setContactStatus("");

    const contactsToCreate = newContacts.filter(
      (item) =>
        item.name.trim() ||
        item.email.trim() ||
        item.phone.trim() ||
        item.department.trim() ||
        item.title.trim() ||
        item.notes.trim()
    );

    if (contactsToCreate.length === 0) {
      setContactStatus(lang === "sv" ? "Fyll i minst en kontakt." : "Enter at least one contact.");
      setContactsSaving(false);
      return;
    }

    try {
      for (const item of contactsToCreate) {
        const response = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: params.id,
            name: item.name,
            email: item.email || undefined,
            phone: item.phone || undefined,
            department: item.department || undefined,
            title: item.title || undefined,
            notes: item.notes || undefined
          })
        });

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          throw new Error(data.error ?? (lang === "sv" ? "Kunde inte spara kontakt" : "Could not save contact"));
        }
      }

      setContactStatus(lang === "sv" ? "Kontakter sparade." : "Contacts saved.");
      setNewContacts([emptyContactDraft()]);
      await loadCustomer();
      await loadActivities();
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : lang === "sv" ? "Något gick fel." : "Something went wrong.");
    } finally {
      setContactsSaving(false);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanSaving(true);
    setPlanStatus("");

    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(form.get("title") ?? "").trim(),
          owner: String(form.get("owner") ?? "").trim() || null,
          status: String(form.get("status") ?? "PLANNED"),
          priority: String(form.get("priority") ?? "MEDIUM"),
          startDate: String(form.get("startDate") ?? "").trim() || null,
          endDate: String(form.get("endDate") ?? "").trim() || null,
          description: String(form.get("description") ?? "").trim() || null,
          customerId: params.id
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? (lang === "sv" ? "Kunde inte skapa plan." : "Could not create plan."));
      }

      formEl.reset();
      setPlanStatus(lang === "sv" ? "Plan sparad." : "Plan saved.");
      await loadCustomer();
      await loadActivities();
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte skapa plan." : "Could not create plan."));
    } finally {
      setPlanSaving(false);
    }
  }

  async function updatePlanStatus(planId: string, status: Customer["plans"][number]["status"]) {
    const res = await fetch(`/api/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? (lang === "sv" ? "Kunde inte uppdatera plan." : "Could not update plan."));
    }
  }

  async function onDropPlan(status: Customer["plans"][number]["status"], planId: string) {
    try {
      await updatePlanStatus(planId, status);
      await loadCustomer();
      await loadActivities();
      setPlanStatus(lang === "sv" ? "Plan uppdaterad." : "Plan updated.");
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : (lang === "sv" ? "Kunde inte uppdatera plan." : "Could not update plan."));
    }
  }

  async function addActivityNote() {
    if (!noteText.trim()) {
      setActivityStatus(lang === "sv" ? "Skriv en notering först." : "Write a note first.");
      return;
    }
    setActivitySaving(true);
    setActivityStatus("");
    const res = await fetch(`/api/customers/${params.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: noteText.trim(), actorName: currentUserEmail || "CRM user" })
    });
    if (!res.ok) {
      let apiError = "";
      try {
        const data = (await res.json()) as { error?: string };
        apiError = data.error || "";
      } catch {
        apiError = "";
      }
      setActivityStatus(apiError || (lang === "sv" ? "Kunde inte spara notering." : "Could not save note."));
      setActivitySaving(false);
      return;
    }
    const created = (await res.json()) as Activity;
    setNoteText("");
    setActivities((prev) => [created, ...prev]);
    setActivityStatus(lang === "sv" ? "Notering sparad." : "Note saved.");
    setActivitySaving(false);
  }

  if (loading) {
    return <section className="crm-card">{lang === "sv" ? "Laddar kundkort..." : "Loading customer profile..."}</section>;
  }

  if (!customer) {
    return <section className="crm-card">{lang === "sv" ? "Kund saknas" : "Customer not found"}</section>;
  }

  return (
    <div className="crm-section">
      <section className="crm-card">
        <h2>{lang === "sv" ? "Kundkort" : "Customer profile"}: {customer.name}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
          {lang === "sv"
            ? "Hantera kunddata, potential och uppdatera signaler från webbsida."
            : "Manage customer data, potential and refresh website signals."}
        </p>
      </section>

      <section className="crm-card">
        <div className="crm-row">
          <button className={`crm-tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")} type="button">
            {lang === "sv" ? "Översikt" : "Overview"}
          </button>
          <button className={`crm-tab ${activeTab === "contacts" ? "active" : ""}`} onClick={() => setActiveTab("contacts")} type="button">
            {lang === "sv" ? "Kontakter" : "Contacts"}
          </button>
          <button className={`crm-tab ${activeTab === "plans" ? "active" : ""}`} onClick={() => setActiveTab("plans")} type="button">
            {lang === "sv" ? "Planer" : "Plans"}
          </button>
          <button className={`crm-tab ${activeTab === "activity" ? "active" : ""}`} onClick={() => setActiveTab("activity")} type="button">
            {lang === "sv" ? "Historik" : "Activity"}
          </button>
          <button className={`crm-tab ${activeTab === "research" ? "active" : ""}`} onClick={() => setActiveTab("research")} type="button">
            {lang === "sv" ? "Researchresultat" : "Research results"}
          </button>
        </div>
      </section>

      {activeTab === "overview" ? (
        <>
          <section className="crm-card">
            <h3>{lang === "sv" ? "Översikt" : "Overview"}</h3>
            <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
              {lang === "sv" ? "Land" : "Country"}: {customer.country ?? "-"} · {lang === "sv" ? "Region" : "Region"}: {customer.region ?? "-"} · {lang === "sv" ? "Säljare" : "Seller"}: {customer.seller ?? "-"}
            </p>
            <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
              {lang === "sv" ? "Bransch" : "Industry"}: {customer.industry ?? "-"} · {lang === "sv" ? "Potential" : "Potential"}: {customer.potentialScore}
            </p>
            <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
              {lang === "sv" ? "Sortimentsmatch (Vendora)" : "Assortment fit (Vendora)"}:{" "}
              {typeof assortmentFitScore === "number" ? `${Math.round(assortmentFitScore)}/100` : "-"}
            </p>
            <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
              {lang === "sv" ? "Kontakter" : "Contacts"}: {customer.contacts.length} · {lang === "sv" ? "Planer" : "Plans"}: {customer.plans.length}
            </p>
            {Array.isArray(customer.webshopSignals?.manualBrandRevenue) && customer.webshopSignals.manualBrandRevenue.length > 0 && (
              <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                {lang === "sv" ? "Varumärken med omsättning" : "Brands with revenue"}:{" "}
                {(customer.webshopSignals.manualBrandRevenue as Array<{ brand?: string; revenue?: number; currency?: string; year?: number }>)
                  .filter((r) => r.brand)
                  .map((r) => `${r.brand} (${(r.revenue ?? 0).toLocaleString()} ${r.currency ?? "SEK"} ${r.year ?? ""})`)
                  .join(" · ")}
              </p>
            )}
          </section>

          <section className="crm-card">
            <h3>{lang === "sv" ? "Kundinformation" : "Customer information"}</h3>
            <form onSubmit={onSave} style={{ marginTop: "0.8rem" }}>
              <div className="crm-row">
                <input className="crm-input" name="name" defaultValue={customer.name} placeholder={lang === "sv" ? "Namn" : "Name"} />
                <input className="crm-input" name="registrationNumber" defaultValue={customer.registrationNumber || customer.webshopSignals?.extractedAutofill?.registrationNumber || ""} placeholder={lang === "sv" ? "Org.nr" : "Reg number"} />
                <input className="crm-input" name="naceCode" defaultValue={customer.naceCode || customer.webshopSignals?.extractedAutofill?.naceCode || ""} placeholder="NACE" style={{ maxWidth: "120px" }} />
                <select className="crm-select" name="industry" defaultValue={customer.industry || customer.webshopSignals?.extractedAutofill?.industry || ""}>
                  <option value="">{lang === "sv" ? "Välj bransch" : "Select industry"}</option>
                  {industryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <select
                  className="crm-select"
                  name="country"
                  defaultValue={customer.country ?? ""}
                  onChange={(event) => setSelectedCountry(event.target.value)}
                >
                  <option value="">{lang === "sv" ? "Välj land" : "Select country"}</option>
                  {countryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select className="crm-select" name="region" defaultValue={customer.region || customer.webshopSignals?.extractedAutofill?.region || ""}>
                  <option value="">{lang === "sv" ? "Välj region" : "Select region"}</option>
                  {regionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select className="crm-select" name="seller" defaultValue={customer.seller ?? ""}>
                  <option value="">{lang === "sv" ? "Välj säljare" : "Select seller"}</option>
                  {sellerOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input className="crm-input" name="address" defaultValue={customer.address || customer.webshopSignals?.extractedAutofill?.address || ""} placeholder={lang === "sv" ? "Adress" : "Address"} />
                <input className="crm-input" name="website" defaultValue={customer.website || customer.webshopSignals?.extractedAutofill?.website || ""} placeholder={lang === "sv" ? "Webbsida" : "Website"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="potentialScore"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={customer.potentialScore}
                  placeholder={lang === "sv" ? "Potential (0-100)" : "Potential (0-100)"}
                />
              </div>
              {customer.status !== "prospect" ? (
              <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                <article className="crm-item">
                  <div className="crm-item-head">
                    <h4 style={{ margin: 0 }}>
                      {lang === "sv" ? "Manuell omsättning per varumärke" : "Manual revenue by brand"}
                    </h4>
                    <button
                      type="button"
                      className="crm-button crm-button-secondary"
                      style={{ padding: "0.25rem 0.5rem" }}
                      onClick={addManualBrandRevenueRow}
                    >
                      {lang === "sv" ? "Lägg till rad" : "Add row"}
                    </button>
                  </div>
                  <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                    {lang === "sv"
                      ? "Används i AI-analys tills backend-API är kopplat."
                      : "Used in AI analysis until backend API integration is enabled."}
                  </p>
                  <datalist id="brand-suggestions">
                    {formConfig.brands.map((b) => <option key={b} value={b} />)}
                  </datalist>
                  <div className="crm-list" style={{ marginTop: "0.55rem" }}>
                    {manualBrandRevenueRows.map((row) => (
                      <article key={row.key} className="crm-item">
                        <div className="crm-row" style={{ gap: "0.5rem" }}>
                          <input
                            className="crm-input"
                            list="brand-suggestions"
                            value={row.brand}
                            placeholder={lang === "sv" ? "Varumärke" : "Brand"}
                            onChange={(event) => updateManualBrandRevenueRow(row.key, { brand: event.target.value })}
                          />
                          <input
                            className="crm-input"
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.revenue}
                            placeholder={lang === "sv" ? "Omsättning" : "Revenue"}
                            onChange={(event) => updateManualBrandRevenueRow(row.key, { revenue: event.target.value })}
                          />
                          <input
                            className="crm-input"
                            value={row.currency}
                            placeholder="SEK"
                            onChange={(event) =>
                              updateManualBrandRevenueRow(row.key, {
                                currency: event.target.value.toUpperCase().slice(0, 8)
                              })
                            }
                          />
                          <input
                            className="crm-input"
                            type="number"
                            min={2000}
                            max={2100}
                            value={row.year}
                            placeholder={lang === "sv" ? "År" : "Year"}
                            onChange={(event) => updateManualBrandRevenueRow(row.key, { year: event.target.value })}
                          />
                          <button
                            type="button"
                            className="crm-button"
                            style={{ padding: "0.25rem 0.5rem" }}
                            onClick={saveBrandRows}
                          >
                            {lang === "sv" ? "Spara" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="crm-button crm-button-secondary"
                            style={{ padding: "0.25rem 0.5rem" }}
                            onClick={() => removeManualBrandRevenueRow(row.key)}
                          >
                            {lang === "sv" ? "Ta bort" : "Remove"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <p className="crm-subtle" style={{ marginTop: "0.55rem" }}>
                    {lang === "sv" ? "Total manuellt angiven omsättning" : "Total manual revenue"}:{" "}
                    {manualBrandRevenueTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} SEK
                  </p>
                </article>
              </div>
              ) : null}
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea className="crm-textarea" name="notes" defaultValue={customer.notes ?? ""} placeholder={lang === "sv" ? "Noteringar" : "Notes"} />
              </div>
              <div className="crm-row" style={{ marginTop: "0.7rem" }}>
                <button className="crm-button" type="submit">{lang === "sv" ? "Spara" : "Save"}</button>
                <button className="crm-button crm-button-secondary" type="button" onClick={runSimilarSearch}>
                  {lang === "sv" ? "Sök liknande kunder (AI)" : "Find similar customers (AI)"}
                </button>
                <Link
                  href={`/research?mode=profile&customerId=${encodeURIComponent(customer.id)}&companyName=${encodeURIComponent(customer.name)}`}
                  className="crm-button crm-button-secondary"
                >
                  {lang === "sv" ? "Research kund" : "Research customer"}
                </Link>
              </div>
              <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
                {lang === "sv"
                  ? `Sparat ${savedAtText} av ${lastSavedBy}`
                  : `Saved at ${savedAtText} by ${lastSavedBy}`}
              </p>
              {status ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{status}</p> : null}
              <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e5e5e5", paddingTop: "1rem" }}>
                <button
                  className="crm-button"
                  type="button"
                  disabled={deleting}
                  onClick={deleteCustomer}
                  style={{ background: "#c63b25", color: "#fff", opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting
                    ? (lang === "sv" ? "Tar bort..." : "Deleting...")
                    : (lang === "sv" ? "Ta bort kund" : "Delete customer")}
                </button>
                {deleteError ? <p style={{ color: "#c63b25", marginTop: "0.4rem", fontSize: "0.85rem" }}>{deleteError}</p> : null}
              </div>
              {similarLoading ? (
                <div style={{ marginTop: "0.6rem" }}>
                  <p className="crm-subtle">{lang === "sv" ? "AI arbetar..." : "AI is working..."}</p>
                  <progress style={{ width: "100%" }} />
                </div>
              ) : null}
              {similarStatus ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{similarStatus}</p> : null}
              {similarResults.length > 0 ? (
                <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                  <div className="crm-row" style={{ marginBottom: "0.5rem" }}>
                    <select className="crm-select" value={similarSortBy} onChange={(event) => setSimilarSortBy(event.target.value as typeof similarSortBy)}>
                      <option value="fit">{lang === "sv" ? "Sortera: Fit" : "Sort: Fit"}</option>
                      <option value="country">{lang === "sv" ? "Sortera: Land" : "Sort: Country"}</option>
                      <option value="region">{lang === "sv" ? "Sortera: Region" : "Sort: Region"}</option>
                      <option value="confidence">{lang === "sv" ? "Sortera: Säkerhet" : "Sort: Confidence"}</option>
                    </select>
                    <select className="crm-select" value={similarSortDir} onChange={(event) => setSimilarSortDir(event.target.value as typeof similarSortDir)}>
                      <option value="desc">{lang === "sv" ? "Högst först" : "Highest first"}</option>
                      <option value="asc">{lang === "sv" ? "Lägst först" : "Lowest first"}</option>
                    </select>
                    <label className="crm-check">
                      <input
                        type="checkbox"
                        checked={hideExistingInSimilar}
                        onChange={(event) => setHideExistingInSimilar(event.target.checked)}
                      />
                      <span>{lang === "sv" ? "Dölj befintliga kunder" : "Hide existing customers"}</span>
                    </label>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="crm-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{lang === "sv" ? "Bolag" : "Company"}</th>
                          <th>{lang === "sv" ? "Land" : "Country"}</th>
                          <th>{lang === "sv" ? "Region" : "Region"}</th>
                          <th>Fit</th>
                          <th>{lang === "sv" ? "Potential" : "Potential"}</th>
                          <th>Total</th>
                          <th>{lang === "sv" ? "Säkerhet" : "Confidence"}</th>
                          <th>{lang === "sv" ? "Status" : "Status"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSimilarResults.map((row, index) => (
                          <tr key={`${row.id || row.name}-${row.website || ""}`}>
                            <td>{index + 1}</td>
                            <td>
                              <button
                                type="button"
                                className="crm-button crm-button-secondary"
                                style={{ padding: "0.25rem 0.5rem" }}
                                onClick={() => runDeepResearchForSimilar(row)}
                              >
                                {row.name}
                              </button>
                            </td>
                            <td>{row.country || "-"}</td>
                            <td>{row.region || "-"}</td>
                            <td>{Number(row.fitScore ?? row.matchScore ?? 0)}</td>
                            <td>{Number(row.potentialScoreRaw ?? row.potentialScore ?? 0)}</td>
                            <td>{Number(row.totalScore ?? row.matchScore ?? 0)}</td>
                            <td>{row.confidence || "-"}</td>
                            <td>{row.alreadyCustomer ? (lang === "sv" ? "Redan kund" : "Already customer") : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {visibleSimilarResults.length > 0 ? (
                    <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                      {lang === "sv"
                        ? `Visar ${visibleSimilarResults.length} kandidater (${sortedSimilarResults.length} totalt).`
                        : `Showing ${visibleSimilarResults.length} candidates (${sortedSimilarResults.length} total).`}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {selectedSimilar ? (
                <section className="crm-card" style={{ marginTop: "0.8rem" }}>
                  <h3>{lang === "sv" ? `Research: ${selectedSimilar.name}` : `Research: ${selectedSimilar.name}`}</h3>
                  {selectedSimilarResearchLoading ? (
                    <div style={{ marginTop: "0.6rem" }}>
                      <p className="crm-subtle">{lang === "sv" ? "AI analyserar kund..." : "AI is analyzing customer..."}</p>
                      <progress style={{ width: "100%" }} />
                    </div>
                  ) : null}
                  {selectedSimilarResearchError ? (
                    <p className="crm-subtle" style={{ marginTop: "0.6rem", color: "#b42318" }}>{selectedSimilarResearchError}</p>
                  ) : null}
                  {selectedSimilarResearch ? (
                    similarResearchSections.length > 0 ? (
                      <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                        {similarResearchSections.map((section) => (
                          <article key={section.title} className="crm-item">
                            <h4 style={{ margin: 0 }}>{section.title}</h4>
                            <pre className="crm-pre" style={{ marginTop: "0.55rem" }}>{section.body}</pre>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <pre className="crm-pre" style={{ marginTop: "0.7rem" }}>{selectedSimilarResearch}</pre>
                    )
                  ) : null}
                </section>
              ) : null}
            </form>
          </section>

          {salesSectionEnabled ? (
            <section className="crm-card">
              <h3>{lang === "sv" ? "Försäljning (beta)" : "Sales (beta)"}</h3>
              <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
                {lang === "sv"
                  ? "Periodiserade försäljningssiffror för kunden. Sektionen är förberedd för ERP/API-integration."
                  : "Period-based sales figures for this customer. Section is prepared for ERP/API integration."}
              </p>

              {salesLoading ? <p className="crm-subtle" style={{ marginTop: "0.6rem" }}>{lang === "sv" ? "Laddar..." : "Loading..."}</p> : null}
              {salesError ? <p className="crm-subtle" style={{ marginTop: "0.6rem", color: "#b42318" }}>{salesError}</p> : null}

              {salesData ? (
                <>
                  <div className="crm-grid" style={{ marginTop: "0.7rem" }}>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Nettoförsäljning" : "Net sales"}</p>
                      <strong>
                        {salesData.totals.netSales.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                        {salesData.rows[0]?.currency ?? "SEK"}
                      </strong>
                    </article>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Order" : "Orders"}</p>
                      <strong>{salesData.totals.ordersCount}</strong>
                    </article>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Sålda enheter" : "Units sold"}</p>
                      <strong>{salesData.totals.unitsSold}</strong>
                    </article>
                    <article className="crm-item">
                      <p className="crm-subtle">{lang === "sv" ? "Snittmarginal" : "Avg margin"}</p>
                      <strong>
                        {typeof salesData.totals.averageGrossMargin === "number"
                          ? `${salesData.totals.averageGrossMargin.toFixed(2)}%`
                          : "-"}
                      </strong>
                    </article>
                  </div>

                  <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                    {salesData.rows.length === 0 ? (
                      <p className="crm-empty">{lang === "sv" ? "Inga försäljningsrader ännu." : "No sales rows yet."}</p>
                    ) : (
                      salesData.rows.map((row) => (
                        <article key={row.id} className="crm-item">
                          <div className="crm-item-head">
                            <strong>
                              {new Date(row.periodStart).toLocaleDateString()} - {new Date(row.periodEnd).toLocaleDateString()}
                            </strong>
                            <span className="crm-badge">{row.source}</span>
                          </div>
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            {(lang === "sv" ? "Netto" : "Net")}: {row.netSales ?? "-"} {row.currency} ·{" "}
                            {(lang === "sv" ? "Order" : "Orders")}: {row.ordersCount ?? "-"} ·{" "}
                            {(lang === "sv" ? "Enheter" : "Units")}: {row.unitsSold ?? "-"} ·{" "}
                            {(lang === "sv" ? "Marginal" : "Margin")}:{" "}
                            {typeof row.grossMargin === "number" ? `${row.grossMargin}%` : "-"}
                          </p>
                        </article>
                      ))
                    )}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {activeTab === "research" ? (
      <section className="crm-card">
        <div className="crm-item-head">
          <h3>{lang === "sv" ? "Researchresultat" : "Research results"}</h3>
          <Link
            href={`/research?mode=profile&customerId=${encodeURIComponent(customer.id)}&companyName=${encodeURIComponent(customer.name)}`}
            className="crm-button crm-button-secondary"
          >
            {lang === "sv" ? "Kör ny research" : "Run new research"}
          </Link>
        </div>
        <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
          {lang === "sv"
            ? "Visar senaste research fullt ut. Äldre research visas som årsflikar (en per år)."
            : "Shows the latest research in full. Older research is available as yearly tabs (one per year)."}
        </p>
        {archivedResearchByYear.length > 0 ? (
          <div className="crm-row" style={{ marginTop: "0.55rem", gap: "0.45rem" }}>
            <span className="crm-subtle" style={{ alignSelf: "center" }}>
              {lang === "sv" ? "Arkiv:" : "Archive:"}
            </span>
            {archivedResearchByYear.map((item) => (
              <button
                key={`research-archive-${item.year}`}
                type="button"
                className={`crm-tab ${selectedResearchArchiveYear === item.year ? "active" : ""}`}
                onClick={() => setSelectedResearchArchiveYear(item.year)}
              >
                {item.year}
              </button>
            ))}
          </div>
        ) : null}
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {researchHistory.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Ingen research sparad ännu." : "No saved research yet."}</p>
          ) : (
            visibleResearchEntries.map((entry) => (
              <article key={entry.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{new Date(entry.ranAt).toLocaleString()}</strong>
                  <div className="crm-row" style={{ gap: "0.4rem" }}>
                    <span className="crm-badge">
                      {entry.id === latestResearchId
                        ? (lang === "sv" ? "Senaste" : "Latest")
                        : String(new Date(entry.ranAt).getFullYear())}
                    </span>
                    <span className="crm-badge">{entry.model || "gemini"}</span>
                  </div>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                  {(lang === "sv" ? "Körd av" : "Run by")}: {entry.ranBy || "-"}
                </p>
                <p style={{ marginTop: "0.4rem" }}>
                  <strong>{lang === "sv" ? "Summary" : "Summary"}:</strong> {entry.summary || "-"}
                </p>
                {entry.commercialRelevance ? (
                  <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>{entry.commercialRelevance}</p>
                ) : null}
                {entry.segmentChannelProfile.length > 0 ? (
                  <ul style={{ marginTop: "0.4rem", paddingLeft: "1.1rem" }}>
                    {entry.segmentChannelProfile.slice(0, 8).map((line, index) => (
                      <li key={`${entry.id}-seg-${index}`} className="crm-subtle">{line}</li>
                    ))}
                  </ul>
                ) : null}
                {entry.scoreDrivers.length > 0 ? (
                  <>
                    <h4 style={{ marginTop: "0.55rem", marginBottom: 0 }}>{lang === "sv" ? "Scoredrivare" : "Score drivers"}</h4>
                    <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                      {entry.scoreDrivers.slice(0, 8).map((driver, index) => (
                        <li key={`${entry.id}-driver-${index}`}>{driver}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {entry.contactPaths && (entry.contactPaths.namedContacts.length > 0 || entry.contactPaths.roleBasedPaths.length > 0) ? (
                  <>
                    <h4 style={{ marginTop: "0.55rem", marginBottom: 0 }}>{lang === "sv" ? "Kontaktvägar" : "Contact paths"}</h4>
                    {entry.contactPaths.namedContacts.length > 0 ? (
                      <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                        {entry.contactPaths.namedContacts.slice(0, 5).map((contact, index) => (
                          <li key={`${entry.id}-contact-${index}`}>
                            <strong>{contact.name || "-"}</strong>
                            {contact.role ? ` · ${contact.role}` : ""}
                            {contact.confidence ? ` · ${contact.confidence}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {entry.contactPaths.roleBasedPaths.length > 0 ? (
                      <ul style={{ marginTop: "0.3rem", paddingLeft: "1.1rem" }}>
                        {entry.contactPaths.roleBasedPaths.slice(0, 6).map((path, index) => (
                          <li key={`${entry.id}-path-${index}`}>
                            <strong>{path.function || "-"}</strong>
                            {path.entryPath ? ` · ${path.entryPath}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {entry.contactPaths.fallbackPath ? (
                      <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>{entry.contactPaths.fallbackPath}</p>
                    ) : null}
                  </>
                ) : null}
                {entry.assumptions.length > 0 ? (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                      {lang === "sv" ? "Antaganden" : "Assumptions"} ({entry.assumptions.length})
                    </summary>
                    <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                      {entry.assumptions.slice(0, 8).map((assumption, index) => (
                        <li key={`${entry.id}-assumption-${index}`}>{assumption}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                  Fit: {entry.fitScore ?? "-"} · {lang === "sv" ? "Sortimentsfit" : "Assortment fit"}: {entry.assortmentFitScore ?? "-"} ·{" "}
                  {lang === "sv" ? "Potential" : "Potential"}: {entry.potentialScore ?? "-"} · Total: {entry.totalScore ?? "-"} ·{" "}
                  {lang === "sv" ? "Säkerhet" : "Confidence"}: {entry.confidence || "-"}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                  Y1: {entry.year1Low || "-"} / {entry.year1Base || "-"} / {entry.year1High || "-"} {entry.year1Currency || ""}
                </p>
                {entry.categories.length > 0 ? (
                  <>
                    <h4 style={{ marginTop: "0.55rem", marginBottom: 0 }}>{lang === "sv" ? "Prioriterade kategorier" : "Priority categories"}</h4>
                    <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                      {entry.categories.slice(0, 8).map((category, index) => (
                        <li key={`${entry.id}-cat-${index}`}>
                          <strong>{category.categoryOrBrand}</strong>
                          {category.whyItFits ? ` - ${category.whyItFits}` : ""}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {entry.nextBestActions.length > 0 ? (
                  <>
                    <h4 style={{ marginTop: "0.55rem", marginBottom: 0 }}>{lang === "sv" ? "Nästa steg" : "Next steps"}</h4>
                    <ol style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                      {entry.nextBestActions.slice(0, 8).map((action, index) => (
                        <li key={`${entry.id}-step-${index}`}>{action}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
                {entry.rawOutput ? (
                  <details style={{ marginTop: "0.55rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                      {lang === "sv" ? "Visa rå AI-output" : "Show raw AI output"}
                    </summary>
                    <pre className="crm-pre" style={{ marginTop: "0.45rem" }}>{entry.rawOutput}</pre>
                  </details>
                ) : null}
                {entry.sourceAttribution ? (
                  <details style={{ marginTop: "0.55rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                      {lang === "sv" ? "Källhänvisning" : "Source attribution"}
                    </summary>
                    {entry.sourceAttribution.web.length > 0 ? (
                      <>
                        <p className="crm-subtle" style={{ marginTop: "0.45rem", marginBottom: "0.25rem" }}>
                          {lang === "sv" ? "Webbkällor" : "Web sources"}
                        </p>
                        <ul style={{ marginTop: 0, paddingLeft: "1.1rem" }}>
                          {entry.sourceAttribution.web.slice(0, 20).map((source, index) => (
                            <li key={`${entry.id}-source-web-${index}`} style={{ marginBottom: "0.3rem" }}>
                              <a href={source.url} target="_blank" rel="noreferrer" className="crm-link-inline">
                                {source.title || source.url}
                              </a>
                              {source.origins.length > 0 ? ` · ${source.origins.join(", ")}` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {entry.sourceAttribution.externalSignals.length > 0 ? (
                      <>
                        <p className="crm-subtle" style={{ marginTop: "0.45rem", marginBottom: "0.25rem" }}>
                          {lang === "sv" ? "Externa signaler/API" : "External signals/APIs"}
                        </p>
                        <ul style={{ marginTop: 0, paddingLeft: "1.1rem" }}>
                          {entry.sourceAttribution.externalSignals.slice(0, 30).map((signal, index) => (
                            <li key={`${entry.id}-source-ext-${index}`} style={{ marginBottom: "0.3rem" }}>
                              {signal.url ? (
                                <a href={signal.url} target="_blank" rel="noreferrer" className="crm-link-inline">
                                  {signal.title || signal.url}
                                </a>
                              ) : (
                                <span>{signal.title || "-"}</span>
                              )}{" "}
                              · {signal.sourceType || "external"}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {entry.sourceAttribution.contacts.length > 0 ? (
                      <>
                        <p className="crm-subtle" style={{ marginTop: "0.45rem", marginBottom: "0.25rem" }}>
                          {lang === "sv" ? "Kontaktspår (auto)" : "Contact signals (auto)"}
                        </p>
                        <ul style={{ marginTop: 0, paddingLeft: "1.1rem" }}>
                          {entry.sourceAttribution.contacts.slice(0, 25).map((contact, index) => (
                            <li key={`${entry.id}-source-contact-${index}`} style={{ marginBottom: "0.3rem" }}>
                              <strong>{contact.name || (lang === "sv" ? "Okänt namn" : "Unknown name")}</strong>
                              {contact.role ? ` · ${contact.role}` : ""} ·{" "}
                              {lang === "sv" ? "Säkerhet" : "Confidence"}: {contact.confidence || "-"} ·{" "}
                              {lang === "sv" ? "Status" : "Status"}: {contact.verificationStatus || "NeedsValidation"}
                              {contact.sourceUrl ? (
                                <>
                                  {" · "}
                                  <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="crm-link-inline">
                                    {contact.sourceType || "source"}
                                  </a>
                                </>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {entry.sourceAttribution.crm ? (
                      <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                        CRM: contacts {entry.sourceAttribution.crm.contactsCount}, plans {entry.sourceAttribution.crm.plansCount}, activities{" "}
                        {entry.sourceAttribution.crm.activitiesCount}, sales {entry.sourceAttribution.crm.salesRecordsCount} ·{" "}
                        {lang === "sv" ? "tidigare research" : "prior research"}:{" "}
                        {entry.sourceAttribution.crm.hasPriorResearch ? (lang === "sv" ? "ja" : "yes") : (lang === "sv" ? "nej" : "no")}
                        {entry.sourceAttribution.crm.customerUpdatedAt
                          ? ` · ${lang === "sv" ? "senast uppdaterad" : "updated"}: ${new Date(entry.sourceAttribution.crm.customerUpdatedAt).toLocaleString()}`
                          : ""}
                      </p>
                    ) : null}
                    {entry.sourceAttribution.discovery ? (
                      <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                        Discovery providers: {(entry.sourceAttribution.discovery.providers || []).join(", ") || "-"} · Seed candidates:{" "}
                        {entry.sourceAttribution.discovery.seedCount}
                      </p>
                    ) : null}
                  </details>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
      ) : null}

      {activeTab === "contacts" ? (
      <section className="crm-card">
        <div className="crm-item-head">
          <h3>{lang === "sv" ? "Kontakter" : "Contacts"}</h3>
          <button className="crm-button crm-button-secondary" type="button" onClick={addContactDraft}>
            + {lang === "sv" ? "Lägg till kontakt" : "Add contact"}
          </button>
        </div>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {lang === "sv"
            ? "Kontaktkort: Namn, E-post, Telefon, Avdelning, Befattning och Noteringar."
            : "Contact card: Name, Email, Phone, Department, Title and Notes."}
        </p>
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customer.contacts.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga kontakter registrerade." : "No contacts registered."}</p>
          ) : (
            customer.contacts.map((contact) => (
              <article key={contact.id} className="crm-item">
                <div className="crm-item-head">
                  <strong>{contact.firstName} {contact.lastName}</strong>
                  <span className="crm-badge">{contact.title ?? "-"}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                  {contact.email ?? "-"} {contact.phone ? ` · ${contact.phone}` : ""}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {(lang === "sv" ? "Avdelning" : "Department") + ": " + (contact.department ?? "-")}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {(lang === "sv" ? "Noteringar" : "Notes") + ": " + (contact.notes ?? "-")}
                </p>
              </article>
            ))
          )}
        </div>
        <div className="crm-list" style={{ marginTop: "0.9rem" }}>
          {newContacts.map((draft, index) => (
            <article key={draft.key} className="crm-item">
              <div className="crm-item-head">
                <strong>{lang === "sv" ? "Ny kontakt" : "New contact"} #{index + 1}</strong>
              </div>
              <div className="crm-row" style={{ marginTop: "0.5rem" }}>
                <input
                  className="crm-input"
                  value={draft.name}
                  onChange={(event) => updateNewContact(index, "name", event.target.value)}
                  placeholder={lang === "sv" ? "Namn" : "Name"}
                />
                <input
                  className="crm-input"
                  value={draft.email}
                  onChange={(event) => updateNewContact(index, "email", event.target.value)}
                  placeholder={lang === "sv" ? "E-post" : "Email"}
                />
                <input
                  className="crm-input"
                  value={draft.phone}
                  onChange={(event) => updateNewContact(index, "phone", event.target.value)}
                  placeholder={lang === "sv" ? "Telefon" : "Phone"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  value={draft.department}
                  onChange={(event) => updateNewContact(index, "department", event.target.value)}
                  placeholder={lang === "sv" ? "Avdelning" : "Department"}
                />
                <input
                  className="crm-input"
                  value={draft.title}
                  onChange={(event) => updateNewContact(index, "title", event.target.value)}
                  placeholder={lang === "sv" ? "Befattning" : "Title"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  value={draft.notes}
                  onChange={(event) => updateNewContact(index, "notes", event.target.value)}
                  placeholder={lang === "sv" ? "Noteringar" : "Notes"}
                />
              </div>
            </article>
          ))}
        </div>
        <div className="crm-row" style={{ marginTop: "0.7rem" }}>
          <button className="crm-button" type="button" disabled={contactsSaving} onClick={saveContacts}>
            {contactsSaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara kontakter" : "Save contacts")}
          </button>
        </div>
        {contactStatus ? <p className="crm-subtle" style={{ marginTop: "0.55rem" }}>{contactStatus}</p> : null}
      </section>
      ) : null}

      {activeTab === "plans" ? (
      <section className="crm-card">
        <h3>{lang === "sv" ? "Planer" : "Plans"}</h3>
        <form onSubmit={createPlan} style={{ marginTop: "0.8rem" }}>
          <div className="crm-row">
            <input className="crm-input" name="title" placeholder={lang === "sv" ? "Titel" : "Title"} required />
            <select className="crm-select" name="owner" defaultValue={customer.seller ?? ""}>
              <option value="">{lang === "sv" ? "Ansvarig (valfritt)" : "Owner (optional)"}</option>
              {sellerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select className="crm-select" name="status" defaultValue="PLANNED">
              <option value="PLANNED">{lang === "sv" ? "Planerad" : "Planned"}</option>
              <option value="IN_PROGRESS">{lang === "sv" ? "Pågående" : "In progress"}</option>
              <option value="ON_HOLD">{lang === "sv" ? "Pausad" : "On hold"}</option>
              <option value="COMPLETED">{lang === "sv" ? "Avslutad" : "Completed"}</option>
            </select>
            <select className="crm-select" name="priority" defaultValue="MEDIUM">
              <option value="LOW">{lang === "sv" ? "Låg" : "Low"}</option>
              <option value="MEDIUM">{lang === "sv" ? "Medel" : "Medium"}</option>
              <option value="HIGH">{lang === "sv" ? "Hög" : "High"}</option>
            </select>
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <input className="crm-input" name="startDate" type="date" />
            <input className="crm-input" name="endDate" type="date" />
          </div>
          <div className="crm-row" style={{ marginTop: "0.6rem" }}>
            <textarea className="crm-textarea" name="description" placeholder={lang === "sv" ? "Beskrivning" : "Description"} />
          </div>
          <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={planSaving}>
            {planSaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara plan" : "Save plan")}
          </button>
          {planStatus ? <p className="crm-subtle" style={{ marginTop: "0.55rem" }}>{planStatus}</p> : null}
        </form>
        <h3 style={{ marginTop: "1rem" }}>{lang === "sv" ? "Pipeline" : "Pipeline"}</h3>
        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
          {lang === "sv" ? "Dra och släpp planer mellan statuskolumner." : "Drag and drop plans between status columns."}
        </p>
        <div className="crm-kanban" style={{ marginTop: "0.8rem" }}>
          {(["PLANNED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"] as const).map((status) => (
            <section
              key={status}
              className="crm-kanban-col"
              onDragOver={(event) => event.preventDefault()}
              onDrop={async (event) => {
                event.preventDefault();
                const planId = event.dataTransfer.getData("text/plain");
                if (!planId) return;
                await onDropPlan(status, planId);
              }}
            >
              <header className="crm-item-head">
                <strong>
                  {planStatusLabel(status)}
                </strong>
                <span className="crm-badge">{customer.plans.filter((plan) => plan.status === status).length}</span>
              </header>
              <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                {customer.plans
                  .filter((plan) => plan.status === status)
                  .map((plan) => (
                    <article
                      key={plan.id}
                      className="crm-item"
                      draggable
                      role="button"
                      tabIndex={0}
                      onClick={() => openPlanModal(plan)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openPlanModal(plan);
                        }
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", plan.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div className="crm-item-head">
                        <strong>{plan.title}</strong>
                        <span className={`crm-badge ${planStatusClass[plan.status]}`}>{plan.priority ?? "MEDIUM"}</span>
                      </div>
                      <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                        {lang === "sv" ? "Ansvarig" : "Owner"}: {plan.owner ?? "-"}
                      </p>
                      <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                        {plan.endDate
                          ? `${lang === "sv" ? "Deadline" : "Deadline"}: ${new Date(plan.endDate).toLocaleDateString()}`
                          : lang === "sv"
                          ? "Ingen deadline"
                          : "No deadline"}
                      </p>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {customer.plans.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Inga planer registrerade." : "No plans registered."}</p>
          ) : (
            customer.plans.map((plan) => (
              <article
                key={plan.id}
                className="crm-item"
                role="button"
                tabIndex={0}
                onClick={() => openPlanModal(plan)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPlanModal(plan);
                  }
                }}
              >
                <div className="crm-item-head">
                  <strong>{plan.title}</strong>
                  <span className={`crm-badge ${planStatusClass[plan.status]}`}>
                    {planStatusLabel(plan.status)}
                  </span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
                  {lang === "sv" ? "Ansvarig" : "Owner"}: {plan.owner ?? "-"}
                </p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {lang === "sv" ? "Prioritet" : "Priority"}: {plan.priority ?? "-"}
                  {plan.endDate ? ` · ${lang === "sv" ? "Deadline" : "Deadline"}: ${new Date(plan.endDate).toLocaleDateString()}` : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
      ) : null}

      {activeTab === "activity" ? (
      <section className="crm-card">
        <h3>{lang === "sv" ? "Aktivitetshistorik" : "Activity history"}</h3>
        <div className="crm-row" style={{ marginTop: "0.7rem" }}>
          <textarea
            className="crm-textarea"
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder={lang === "sv" ? "Lägg till notering..." : "Add note..."}
          />
        </div>
        <div className="crm-row" style={{ marginTop: "0.6rem" }}>
          <button className="crm-button" type="button" onClick={addActivityNote} disabled={activitySaving}>
            {activitySaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara notering" : "Save note")}
          </button>
        </div>
        {activityStatus ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{activityStatus}</p> : null}
        <div className="crm-list" style={{ marginTop: "0.7rem" }}>
          {activities.length === 0 ? (
            <p className="crm-empty">{lang === "sv" ? "Ingen aktivitet ännu." : "No activity yet."}</p>
          ) : (
            activities.map((item) => (
              <article
                key={item.id}
                className="crm-item"
                role="button"
                tabIndex={0}
                onClick={() => openActivityModal(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openActivityModal(item);
                  }
                }}
              >
                <div className="crm-item-head">
                  <strong>{item.type}</strong>
                  <span className="crm-badge">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>{item.message}</p>
                <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                  {(item.actorName || "-") + " · " + new Date(item.createdAt).toLocaleString()}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
      ) : null}

      {selectedPlanDraft || selectedActivity ? (
        <section className="crm-modal-backdrop" onClick={closeItemModal}>
          <article className="crm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crm-item-head">
              <h3 style={{ margin: 0 }}>
                {selectedPlanDraft
                  ? (lang === "sv" ? "Plan-detaljer" : "Plan details")
                  : (lang === "sv" ? "Aktivitetsdetaljer" : "Activity details")}
              </h3>
              <button className="crm-button crm-button-secondary" type="button" onClick={closeItemModal}>
                {lang === "sv" ? "Stäng" : "Close"}
              </button>
            </div>

            {selectedPlanDraft ? (
              <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                <input
                  className="crm-input"
                  value={selectedPlanDraft.title}
                  onChange={(event) => setSelectedPlanDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  placeholder={lang === "sv" ? "Titel" : "Title"}
                />
                <textarea
                  className="crm-textarea"
                  value={selectedPlanDraft.description}
                  onChange={(event) => setSelectedPlanDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                  placeholder={lang === "sv" ? "Beskrivning" : "Description"}
                />
                <div className="crm-row">
                  <select
                    className="crm-select"
                    value={selectedPlanDraft.owner}
                    onChange={(event) => setSelectedPlanDraft((prev) => (prev ? { ...prev, owner: event.target.value } : prev))}
                  >
                    <option value="">{lang === "sv" ? "Ansvarig (valfritt)" : "Owner (optional)"}</option>
                    {sellerOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <select
                    className="crm-select"
                    value={selectedPlanDraft.status}
                    onChange={(event) =>
                      setSelectedPlanDraft((prev) =>
                        prev ? { ...prev, status: event.target.value as ModalPlanDraft["status"] } : prev
                      )
                    }
                  >
                    <option value="PLANNED">{lang === "sv" ? "Planerad" : "Planned"}</option>
                    <option value="IN_PROGRESS">{lang === "sv" ? "Pågående" : "In progress"}</option>
                    <option value="ON_HOLD">{lang === "sv" ? "Pausad" : "On hold"}</option>
                    <option value="COMPLETED">{lang === "sv" ? "Avslutad" : "Completed"}</option>
                  </select>
                  <select
                    className="crm-select"
                    value={selectedPlanDraft.priority}
                    onChange={(event) =>
                      setSelectedPlanDraft((prev) =>
                        prev ? { ...prev, priority: event.target.value as ModalPlanDraft["priority"] } : prev
                      )
                    }
                  >
                    <option value="LOW">{lang === "sv" ? "Låg" : "Low"}</option>
                    <option value="MEDIUM">{lang === "sv" ? "Medel" : "Medium"}</option>
                    <option value="HIGH">{lang === "sv" ? "Hög" : "High"}</option>
                  </select>
                </div>
                <div className="crm-row">
                  <input
                    className="crm-input"
                    type="date"
                    value={selectedPlanDraft.startDate}
                    onChange={(event) => setSelectedPlanDraft((prev) => (prev ? { ...prev, startDate: event.target.value } : prev))}
                  />
                  <input
                    className="crm-input"
                    type="date"
                    value={selectedPlanDraft.endDate}
                    onChange={(event) => setSelectedPlanDraft((prev) => (prev ? { ...prev, endDate: event.target.value } : prev))}
                  />
                </div>
                <div className="crm-row">
                  <button className="crm-button" type="button" disabled={modalSaving} onClick={savePlanFromModal}>
                    {modalSaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara och uppdatera pipeline" : "Save and update pipeline")}
                  </button>
                </div>
              </div>
            ) : null}

            {selectedActivity ? (
              <div className="crm-list" style={{ marginTop: "0.7rem" }}>
                <article className="crm-item">
                  <div className="crm-item-head">
                    <strong>{selectedActivity.type}</strong>
                    <span className="crm-badge">{new Date(selectedActivity.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>{selectedActivity.message}</p>
                  <p className="crm-subtle" style={{ marginTop: "0.2rem" }}>
                    {(lang === "sv" ? "Av" : "By")}: {selectedActivity.actorName || "-"}
                  </p>
                </article>
                <textarea
                  className="crm-textarea"
                  value={activityFollowupText}
                  onChange={(event) => setActivityFollowupText(event.target.value)}
                  placeholder={lang === "sv" ? "Lägg till uppföljning till aktiviteten..." : "Add follow-up to this activity..."}
                />
                <button className="crm-button" type="button" disabled={modalSaving} onClick={addActivityFollowupFromModal}>
                  {modalSaving ? (lang === "sv" ? "Sparar..." : "Saving...") : (lang === "sv" ? "Spara uppföljning" : "Save follow-up")}
                </button>
              </div>
            ) : null}

            <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "1rem 0" }} />
            <h4 style={{ margin: 0 }}>{lang === "sv" ? "Dela" : "Share"}</h4>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <label className="crm-check">
                <input type="checkbox" checked={shareSlack} onChange={(event) => setShareSlack(event.target.checked)} />
                <span>Slack</span>
              </label>
              <label className="crm-check">
                <input type="checkbox" checked={shareEmail} onChange={(event) => setShareEmail(event.target.checked)} />
                <span>{lang === "sv" ? "E-post" : "Email"}</span>
              </label>
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                value={shareRecipients}
                onChange={(event) => setShareRecipients(event.target.value)}
                placeholder={lang === "sv" ? "E-postmottagare (en per rad eller kommaseparerat)" : "Email recipients (one per line or comma-separated)"}
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <textarea
                className="crm-textarea"
                value={shareNote}
                onChange={(event) => setShareNote(event.target.value)}
                placeholder={lang === "sv" ? "Meddelande till delningen (valfritt)" : "Share note (optional)"}
              />
            </div>
            <div className="crm-row" style={{ marginTop: "0.6rem" }}>
              <button className="crm-button crm-button-secondary" type="button" disabled={shareSaving} onClick={shareCurrentItem}>
                {shareSaving ? (lang === "sv" ? "Delar..." : "Sharing...") : (lang === "sv" ? "Dela via Slack/Mail" : "Share via Slack/Email")}
              </button>
            </div>
            {shareStatus ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{shareStatus}</p> : null}
          </article>
        </section>
      ) : null}

      {customer.webshopSignals ? (
        <section className="crm-card">
          <h3>{lang === "sv" ? "Webshop-signaler" : "Webshop signals"}</h3>
          <p className="crm-subtle" style={{ marginTop: "0.4rem" }}>
            {customer.webshopSignals.title ?? "-"}
          </p>
          <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
            {customer.webshopSignals.description ?? "-"}
          </p>
          <p className="crm-subtle" style={{ marginTop: "0.3rem" }}>
            {lang === "sv" ? "Senast synk" : "Last synced"}: {customer.webshopSignals.syncedAt ?? "-"}
          </p>
        </section>
      ) : null}

    </div>
  );
}
