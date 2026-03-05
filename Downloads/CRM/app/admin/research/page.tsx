"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n";
import { useSearchParams } from "next/navigation";

type TabKey = "import-export" | "research" | "settings";
type SettingsTabKey = "base" | "sources" | "prompts" | "notifications";

type ResearchResponse = {
  query: {
    customerId: string | null;
    companyName: string;
    scope: "country" | "region";
    segmentFocus?: "B2B" | "B2C" | "MIXED";
    externalMode?: "similar" | "profile";
  };
  websiteSnapshots: Array<{ url: string; title: string | null; vendoraFitScore: number }>;
  similarCustomers: Array<{ id: string; name: string; matchScore: number; potentialScore: number }>;
  structuredInsight?: {
    summary?: string;
    segmentChannelProfile?: string[];
    commercialRelevance?: string;
    confidence?: "High" | "Medium" | "Low";
    fitScore?: number | null;
    assortmentFitScore?: number | null;
    potentialScore?: number | null;
    totalScore?: number | null;
    year1Potential?: { low?: string; base?: string; high?: string; currency?: string };
    categoriesToPitch?: Array<{ categoryOrBrand?: string; whyItFits?: string; opportunityLevel?: string }>;
    scoreDrivers?: string[];
    assumptions?: string[];
    contactPaths?: {
      namedContacts?: Array<{ name?: string; role?: string; confidence?: string }>;
      roleBasedPaths?: Array<{ function?: string; entryPath?: string; confidence?: string }>;
      fallbackPath?: string;
    };
    nextBestActions?: string[];
  } | null;
  savedInsight?: {
    id: string;
    potentialScore: number;
    updatedAt: string;
  } | null;
  aiPrompt: string;
  usedExtraInstructions?: string | null;
  companySignals?: Array<{ title: string; url: string; snippet: string; sourceType: string }> | null;
  aiResult?: { provider: "gemini"; model: string; outputText: string } | null;
  aiError?: string | null;
};

type MarkdownSection = {
  title: string;
  body: string;
};

type JsonMap = Record<string, unknown>;

type NormalizedProfileResearch = {
  accountSummary: JsonMap;
  scorecard: JsonMap;
  growth: JsonMap;
  categories: JsonMap[];
  contactPaths: JsonMap;
  recommendedPitch: JsonMap;
  outreachAssets: JsonMap;
  risks: JsonMap;
  nextBestActions: string[];
  evidenceLog: JsonMap[];
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
  const recommendedPitch = asJsonMap(root.recommended_pitch) ?? {};
  const outreachAssets = asJsonMap(root.outreach_assets) ?? {};
  const risks = asJsonMap(root.risks_and_barriers) ?? asJsonMap(root.risks_and_open_questions) ?? {};
  const nextBestActions = asTextArray(root.next_best_actions);
  const evidenceLog = asJsonArray(root.evidence_log)
    .map((row) => asJsonMap(row))
    .filter((row): row is JsonMap => Boolean(row));

  const hasData =
    Object.keys(accountSummary).length > 0 ||
    Object.keys(scorecard).length > 0 ||
    Object.keys(growth).length > 0 ||
    categories.length > 0 ||
    Object.keys(contactPaths).length > 0 ||
    Object.keys(recommendedPitch).length > 0 ||
    Object.keys(outreachAssets).length > 0 ||
    Object.keys(risks).length > 0 ||
    nextBestActions.length > 0 ||
    evidenceLog.length > 0;
  if (!hasData) return null;

  return {
    accountSummary,
    scorecard,
    growth,
    categories,
    contactPaths,
    recommendedPitch,
    outreachAssets,
    risks,
    nextBestActions,
    evidenceLog
  };
}

function normalizeProfileResearchFromStructuredInsight(value: ResearchResponse["structuredInsight"]): NormalizedProfileResearch | null {
  if (!value) return null;
  const year = value.year1Potential ?? {};
  const accountSummary: JsonMap = {
    summary: value.summary ?? "",
    segment_channel_profile: Array.isArray(value.segmentChannelProfile) ? value.segmentChannelProfile : [],
    commercial_relevance_for_vendora: value.commercialRelevance ?? "",
    verification_status: "Estimated",
    confidence: value.confidence ?? ""
  };
  const scorecard: JsonMap = {
    fit_score: value.fitScore ?? null,
    assortment_fit_score: value.assortmentFitScore ?? null,
    potential_score: value.potentialScore ?? null,
    total_score: value.totalScore ?? null,
    year_1_purchase_potential: {
      low: year.low ?? "",
      base: year.base ?? "",
      high: year.high ?? "",
      currency: year.currency ?? "SEK"
    },
    score_drivers: Array.isArray(value.scoreDrivers) ? value.scoreDrivers : [],
    assumptions: Array.isArray(value.assumptions) ? value.assumptions : [],
    confidence: value.confidence ?? ""
  };
  const categories = Array.isArray(value.categoriesToPitch)
    ? value.categoriesToPitch.map((item) => ({
        category_or_brand: item.categoryOrBrand ?? "",
        why_it_fits: item.whyItFits ?? "",
        opportunity_level: item.opportunityLevel ?? ""
      }))
    : [];
  const contactPaths: JsonMap = {
    named_contacts: Array.isArray(value.contactPaths?.namedContacts)
      ? value.contactPaths.namedContacts.map((item) => ({
          name: item.name ?? "",
          role: item.role ?? "",
          confidence: item.confidence ?? ""
        }))
      : [],
    role_based_paths: Array.isArray(value.contactPaths?.roleBasedPaths)
      ? value.contactPaths.roleBasedPaths.map((item) => ({
          function: item.function ?? "",
          likely_entry_path: item.entryPath ?? "",
          confidence: item.confidence ?? ""
        }))
      : [],
    fallback_path: value.contactPaths?.fallbackPath ?? ""
  };
  const nextBestActions = Array.isArray(value.nextBestActions) ? value.nextBestActions : [];

  return {
    accountSummary,
    scorecard,
    growth: {},
    categories,
    contactPaths,
    recommendedPitch: {},
    outreachAssets: {},
    risks: {},
    nextBestActions,
    evidenceLog: []
  };
}

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
  preferredSourceDomains: string[];
  blockedSourceDomains: string[];
  registrySourceUrls: string[];
  pxwebBaseUrl: string;
  pxwebSniTablePath: string;
  pxwebSniVariable: string;
  pxwebRegionVariable: string;
  pxwebTimeVariable: string;
  pxwebContentVariable: string;
  pxwebDefaultContentCode: string;
  globalSystemPrompt: string;
  fullResearchPrompt: string;
  similarCustomersPrompt: string;
  followupCustomerClickPrompt: string;
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

type SniStatsResponse = {
  configured?: boolean;
  error?: string;
  tableTitle?: string;
  selected?: {
    sniCodes?: string[];
    region?: string | null;
    time?: string | null;
    contentCode?: string | null;
  };
  rows?: Array<{
    sniCode?: string;
    value?: number | null;
    rawValue?: string;
    dimensions?: Record<string, string>;
  }>;
};

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  slackMemberId: string | null;
  isAdmin?: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
};

const EMPTY_CONFIG: ResearchConfig = {
  vendorWebsites: ["https://reseller.vendora.se", "https://www.vendora.se"],
  brandWebsites: [],
  preferredSourceDomains: ["allabolag.se", "proff.se", "finder.fi", "asiakastieto.fi", "linkedin.com"],
  blockedSourceDomains: ["glassdoor.com", "clutch.co", "rocketreach.co", "yelp.com"],
  registrySourceUrls: ["https://www.allabolag.se", "https://www.proff.se", "https://www.asiakastieto.fi"],
  pxwebBaseUrl: "",
  pxwebSniTablePath: "",
  pxwebSniVariable: "SNI2007",
  pxwebRegionVariable: "Region",
  pxwebTimeVariable: "Tid",
  pxwebContentVariable: "ContentsCode",
  pxwebDefaultContentCode: "",
  globalSystemPrompt:
    "You are an account intelligence and channel sales analyst for Vendora Nordic.\n" +
    "Output in English only. Be concise, practical, and evidence-based.\n" +
    "Never invent facts. Unknown data must be labeled Estimated + confidence + signals.\n" +
    "Use FitScore, PotentialScore, TotalScore (0.55*Fit + 0.45*Potential).\n" +
    "Only include commercially useful recommendations and clear next actions.",
  fullResearchPrompt:
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
  similarCustomersPrompt:
    "Find up to 8 similar reseller customers based on this selected account. Use country/region scope first and fall back to country when needed. Prefer public company registers/directories and include confidence + source signals.",
  followupCustomerClickPrompt:
    "Deep-research this selected similar company for Vendora fit and commercial potential. Quantify likely Year-1 potential range, highlight top product families to pitch, and provide concrete next steps.",
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
  const [isAdminUser, setIsAdminUser] = useState(false);
  const adminMode = isAdminUser;
  const [tab, setTab] = useState<TabKey>("research");
  const [researchCustomerId, setResearchCustomerId] = useState("");
  const [researchCompanyName, setResearchCompanyName] = useState("");
  const [researchScope, setResearchScope] = useState<"region" | "country">("region");
  const [researchSegmentFocus, setResearchSegmentFocus] = useState<"AUTO" | "B2B" | "B2C" | "MIXED">("AUTO");
  const [researchRunMode, setResearchRunMode] = useState<"profile" | "similar">("profile");

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
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersStatus, setUsersStatus] = useState("");
  const [userSlackDrafts, setUserSlackDrafts] = useState<Record<string, string>>({});
  const [sniCodesDraft, setSniCodesDraft] = useState("");
  const [sniRegionDraft, setSniRegionDraft] = useState("");
  const [sniTimeDraft, setSniTimeDraft] = useState("");
  const [sniStatsLoading, setSniStatsLoading] = useState(false);
  const [sniStatsError, setSniStatsError] = useState("");
  const [sniStatsResult, setSniStatsResult] = useState<SniStatsResponse | null>(null);

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
  const parsedResearchJson = useMemo(() => {
    const parsed = parseJsonLoose(aiText);
    return asJsonMap(parsed);
  }, [aiText]);
  const normalizedProfileResearch = useMemo(
    () => normalizeProfileResearchJson(parsedResearchJson),
    [parsedResearchJson]
  );
  const normalizedProfileResearchFromStructured = useMemo(
    () => normalizeProfileResearchFromStructuredInsight(result?.structuredInsight ?? null),
    [result?.structuredInsight]
  );
  const effectiveProfileResearch = normalizedProfileResearch ?? normalizedProfileResearchFromStructured;
  const isProfileResearchMode = researchRunMode === "profile";
  const extraInstructionsPlaceholder = isProfileResearchMode
    ? (lang === "sv"
      ? "Extra AI-instruktion för vald kund (t.ex. Fokusera på vilka produktfamiljer från reseller.vendora.se som kan säljas mer och motivera med potential)."
      : "Extra AI instruction for selected customer (e.g. Focus on which product families from reseller.vendora.se can be expanded and explain potential).")
    : (lang === "sv"
      ? "Extra AI-instruktion för liknande kunder (t.ex. Visa bara bolag med omsättning > 50 MSEK)."
      : "Extra AI instruction for similar-customer search (e.g. Only show companies with revenue > 50 MSEK).");

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
    if (!isAdminUser) return;
    loadSettings();
  }, [isAdminUser]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { isAdmin?: boolean };
      })
      .then((data) => setIsAdminUser(Boolean(data?.isAdmin)))
      .catch(() => setIsAdminUser(false));
  }, []);

  async function loadAdminUsers() {
    setUsersLoading(true);
    setUsersStatus("");
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await res.json()) as { users?: AdminUser[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load users");
      const users = Array.isArray(data.users) ? data.users : [];
      setAdminUsers(users);
      setUserSlackDrafts(
        users.reduce<Record<string, string>>((acc, user) => {
          acc[user.id] = user.slackMemberId || "";
          return acc;
        }, {})
      );
    } catch (error) {
      setUsersStatus(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "settings" && settingsTab === "notifications") {
      loadAdminUsers();
    }
  }, [tab, settingsTab]);

  async function saveUserSlackMemberId(userId: string) {
    const slackMemberId = (userSlackDrafts[userId] || "").trim();
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, slackMemberId })
      });
      const data = (await res.json()) as { user?: AdminUser; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save Slack Member ID");
      const updatedUser = data.user;
      if (updatedUser) {
        setAdminUsers((prev) => prev.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
        setUserSlackDrafts((prev) => ({ ...prev, [updatedUser.id]: updatedUser.slackMemberId || "" }));
      }
      setUsersStatus(lang === "sv" ? "Slack Member ID sparat." : "Slack Member ID saved.");
    } catch (error) {
      setUsersStatus(error instanceof Error ? error.message : "Failed to save Slack Member ID");
    }
  }

  useEffect(() => {
    if (!researchBasePromptDraft && config.fullResearchPrompt) {
      setResearchBasePromptDraft(config.fullResearchPrompt);
    }
  }, [config.fullResearchPrompt, researchBasePromptDraft]);

  useEffect(() => {
    if (!researchExtraInstructionsDraft && config.extraInstructions) {
      setResearchExtraInstructionsDraft(config.extraInstructions);
    }
  }, [config.extraInstructions, researchExtraInstructionsDraft]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (adminMode && (tabParam === "import-export" || tabParam === "research" || tabParam === "settings")) {
      setTab(tabParam);
    }

    const customerIdParam = searchParams.get("customerId");
    const companyNameParam = searchParams.get("companyName");
    const scopeParam = searchParams.get("scope");
    const segmentParam = searchParams.get("segmentFocus");
    const modeParam = searchParams.get("mode");

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
    setResearchRunMode(modeParam === "similar" ? "similar" : "profile");
    if (modeParam === "profile") {
      const current = researchBasePromptDraft.trim();
      const full = config.fullResearchPrompt.trim();
      if (!current || current === full) {
        setResearchBasePromptDraft(config.followupCustomerClickPrompt || config.fullResearchPrompt);
      }
    } else if (modeParam === "similar") {
      const current = researchBasePromptDraft.trim();
      const followup = config.followupCustomerClickPrompt.trim();
      if (!current || current === followup) {
        setResearchBasePromptDraft(config.similarCustomersPrompt || config.fullResearchPrompt);
      }
    }
  }, [
    adminMode,
    searchParams,
    config.defaultScope,
    config.followupCustomerClickPrompt,
    config.fullResearchPrompt,
    config.similarCustomersPrompt,
    researchBasePromptDraft
  ]);

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
          externalOnly: true,
          externalMode: researchRunMode,
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

  async function onSniLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSniStatsLoading(true);
    setSniStatsError("");
    setSniStatsResult(null);

    const codes = sniCodesDraft
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (codes.length === 0) {
      setSniStatsError(lang === "sv" ? "Ange minst en SNI-kod." : "Enter at least one SNI code.");
      setSniStatsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/stats/sni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sniCodes: codes,
          region: sniRegionDraft.trim() || null,
          time: sniTimeDraft.trim() || null,
          maxRows: 200
        })
      });
      const data = (await res.json()) as SniStatsResponse;
      if (!res.ok) throw new Error(data.error || "SNI lookup failed");
      setSniStatsResult(data);
    } catch (error) {
      setSniStatsError(error instanceof Error ? error.message : "SNI lookup failed");
    } finally {
      setSniStatsLoading(false);
    }
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
      preferredSourceDomains: String(form.get("preferredSourceDomains") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      blockedSourceDomains: String(form.get("blockedSourceDomains") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      registrySourceUrls: String(form.get("registrySourceUrls") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      pxwebBaseUrl: String(form.get("pxwebBaseUrl") ?? "").trim(),
      pxwebSniTablePath: String(form.get("pxwebSniTablePath") ?? "").trim(),
      pxwebSniVariable: String(form.get("pxwebSniVariable") ?? "SNI2007").trim(),
      pxwebRegionVariable: String(form.get("pxwebRegionVariable") ?? "Region").trim(),
      pxwebTimeVariable: String(form.get("pxwebTimeVariable") ?? "Tid").trim(),
      pxwebContentVariable: String(form.get("pxwebContentVariable") ?? "ContentsCode").trim(),
      pxwebDefaultContentCode: String(form.get("pxwebDefaultContentCode") ?? "").trim(),
      globalSystemPrompt: String(form.get("globalSystemPrompt") ?? "").trim(),
      fullResearchPrompt: String(form.get("fullResearchPrompt") ?? "").trim(),
      similarCustomersPrompt: String(form.get("similarCustomersPrompt") ?? "").trim(),
      followupCustomerClickPrompt: String(form.get("followupCustomerClickPrompt") ?? "").trim(),
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
        <h2>{adminMode ? (lang === "sv" ? "Admin" : "Admin") : (lang === "sv" ? "Research" : "Research")}</h2>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          {adminMode
            ? (lang === "sv"
              ? "Hantera CSV, research och AI-inställningar i ett arbetsflöde."
              : "Manage CSV, research and AI settings in one workflow.")
            : (lang === "sv"
              ? "Kör research och kundanalys."
              : "Run research and customer analysis.")}
        </p>

        {adminMode ? (
          <div className="crm-row" style={{ marginTop: "0.8rem" }}>
            <button className={`crm-tab ${tab === "import-export" ? "active" : ""}`} type="button" onClick={() => setTab("import-export")}>{labels.importExport}</button>
            <button className={`crm-tab ${tab === "research" ? "active" : ""}`} type="button" onClick={() => setTab("research")}>{labels.research}</button>
            <button className={`crm-tab ${tab === "settings" ? "active" : ""}`} type="button" onClick={() => setTab("settings")}>{labels.settings}</button>
          </div>
        ) : null}
      </section>

      {adminMode && tab === "import-export" ? (
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

      {(tab === "research" || !adminMode) ? (
        <>
          <section className="crm-card">
            <h3>{isProfileResearchMode ? (lang === "sv" ? "Research kund" : "Research customer") : (lang === "sv" ? "Research och AI-prompt" : "Research and AI prompt")}</h3>
            {isProfileResearchMode ? (
              <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                {lang === "sv" ? "Vald kund" : "Selected customer"}:{" "}
                <strong>{researchCompanyName.trim() || result?.query.companyName || "-"}</strong>
                {" · "}
                {lang === "sv" ? "Kund-ID" : "Customer ID"}:{" "}
                <strong>{researchCustomerId.trim() || result?.query.customerId || "-"}</strong>
              </p>
            ) : null}
            <form onSubmit={onResearchSubmit} style={{ marginTop: "0.7rem" }}>
              {!isProfileResearchMode ? (
                <>
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
                      name="runMode"
                      value={researchRunMode}
                      onChange={(event) => setResearchRunMode(event.target.value === "similar" ? "similar" : "profile")}
                    >
                      <option value="profile">{lang === "sv" ? "Läge: Djupanalys av kund" : "Mode: Deep customer profile"}</option>
                      <option value="similar">{lang === "sv" ? "Läge: Hitta liknande kunder" : "Mode: Find similar customers"}</option>
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
                  {adminMode ? (
                    <>
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
                          onClick={() => setResearchBasePromptDraft(config.fullResearchPrompt)}
                        >
                          {lang === "sv" ? "Återställ grundprompt" : "Reset base prompt"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <textarea
                  className="crm-textarea"
                  value={researchExtraInstructionsDraft}
                  onChange={(event) => setResearchExtraInstructionsDraft(event.target.value)}
                  placeholder={extraInstructionsPlaceholder}
                />
              </div>
              {!isProfileResearchMode ? (
                <div className="crm-row" style={{ marginTop: "0.4rem" }}>
                  <button
                    className="crm-button crm-button-secondary"
                    type="button"
                    onClick={() => setResearchExtraInstructionsDraft(config.extraInstructions)}
                  >
                    {lang === "sv" ? "Återställ extra instruktioner" : "Reset extra instructions"}
                  </button>
                </div>
              ) : null}

              <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={researchLoading}>
                {researchLoading ? (
                  <span className="crm-btn-loading">
                    <span className="crm-spinner" aria-hidden="true" />
                    {lang === "sv" ? "Analyserar..." : "Analyzing..."}
                  </span>
                ) : (
                  lang === "sv" ? "Genomför research" : "Conduct research"
                )}
              </button>
              {researchLoading ? (
                <div className="crm-ai-loading" role="status" aria-live="polite">
                  <p className="crm-subtle">
                    {lang === "sv"
                      ? "AI arbetar med att analysera kunddata och externa signaler..."
                      : "AI is analyzing customer data and external signals..."}
                  </p>
                  <div className="crm-progress">
                    <span />
                  </div>
                </div>
              ) : null}
              {researchError ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.6rem" }}>{researchError}</p> : null}
            </form>
          </section>

          <section className="crm-card">
            <h3>{lang === "sv" ? "Branschstatistik (SNI)" : "Industry statistics (SNI)"}</h3>
            <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
              {lang === "sv"
                ? "Sök på en eller flera SNI-koder och hämta statistik via PxWeb."
                : "Lookup one or more SNI codes and fetch statistics via PxWeb."}
            </p>
            <form onSubmit={onSniLookup} style={{ marginTop: "0.7rem" }}>
              <div className="crm-row">
                <input
                  className="crm-input"
                  value={sniCodesDraft}
                  onChange={(event) => setSniCodesDraft(event.target.value)}
                  placeholder={lang === "sv" ? "SNI-koder (t.ex. 47430, 47540)" : "SNI codes (e.g. 47430, 47540)"}
                />
                <input
                  className="crm-input"
                  value={sniRegionDraft}
                  onChange={(event) => setSniRegionDraft(event.target.value)}
                  placeholder={lang === "sv" ? "Region (valfritt)" : "Region (optional)"}
                />
                <input
                  className="crm-input"
                  value={sniTimeDraft}
                  onChange={(event) => setSniTimeDraft(event.target.value)}
                  placeholder={lang === "sv" ? "Tid/År (valfritt)" : "Time/Year (optional)"}
                />
              </div>
              <button className="crm-button" type="submit" style={{ marginTop: "0.7rem" }} disabled={sniStatsLoading}>
                {sniStatsLoading
                  ? (lang === "sv" ? "Hämtar statistik..." : "Loading statistics...")
                  : (lang === "sv" ? "Hämta SNI-statistik" : "Fetch SNI statistics")}
              </button>
              {sniStatsError ? (
                <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.6rem" }}>
                  {sniStatsError}
                </p>
              ) : null}
            </form>
            {sniStatsResult ? (
              <div style={{ marginTop: "0.75rem" }}>
                <p className="crm-subtle">
                  {lang === "sv" ? "Tabell" : "Table"}: <strong>{sniStatsResult.tableTitle || "-"}</strong> ·{" "}
                  {lang === "sv" ? "Träffar" : "Rows"}: <strong>{sniStatsResult.rows?.length ?? 0}</strong>
                </p>
                <div className="crm-list" style={{ marginTop: "0.5rem" }}>
                  {(sniStatsResult.rows ?? []).slice(0, 50).map((row, index) => (
                    <article className="crm-item" key={`${row.sniCode || "sni"}-${index}`}>
                      <p>
                        <strong>SNI:</strong> {row.sniCode || "-"} · <strong>{lang === "sv" ? "Värde" : "Value"}:</strong>{" "}
                        {row.value ?? row.rawValue ?? "-"}
                      </p>
                      {row.dimensions ? (
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          {Object.entries(row.dimensions)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {result ? (
            <>
              {isProfileResearchMode ? (
                <section className="crm-card">
                  <h3>{lang === "sv" ? "Kundanalys" : "Customer analysis"}</h3>
                  {result.aiError ? <p className="crm-subtle" style={{ color: "#b42318", marginTop: "0.5rem" }}>{result.aiError}</p> : null}
                  {effectiveProfileResearch ? (
                    <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                      <article className="crm-item">
                        <h4 style={{ margin: 0 }}>{lang === "sv" ? "Account summary" : "Account summary"}</h4>
                        <p style={{ marginTop: "0.45rem" }}>
                          <strong>{lang === "sv" ? "Summary" : "Summary"}:</strong> {asText(effectiveProfileResearch.accountSummary.summary) || "-"}
                        </p>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          <strong>{lang === "sv" ? "Commercial relevance" : "Commercial relevance"}:</strong> {asText(effectiveProfileResearch.accountSummary.commercial_relevance_for_vendora) || "-"}
                        </p>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          <strong>{lang === "sv" ? "Verification" : "Verification"}:</strong> {asText(effectiveProfileResearch.accountSummary.verification_status) || "-"} ·{" "}
                          <strong>{lang === "sv" ? "Confidence" : "Confidence"}:</strong> {asText(effectiveProfileResearch.accountSummary.confidence) || "-"}
                        </p>
                        {asTextArray(effectiveProfileResearch.accountSummary.segment_channel_profile).length > 0 ? (
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {asTextArray(effectiveProfileResearch.accountSummary.segment_channel_profile).slice(0, 12).map((line, index) => (
                              <li key={`${line}-${index}`}>{line}</li>
                            ))}
                          </ul>
                        ) : null}
                      </article>

                      <article className="crm-item">
                        <h4 style={{ margin: 0 }}>{lang === "sv" ? "Vendora fit scorecard" : "Vendora fit scorecard"}</h4>
                        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                          Fit: {String(effectiveProfileResearch.scorecard.fit_score ?? "-")} ·{" "}
                          {lang === "sv" ? "Sortimentsfit" : "Assortment fit"}: {String(effectiveProfileResearch.scorecard.assortment_fit_score ?? effectiveProfileResearch.scorecard.fit_score ?? "-")} ·{" "}
                          Potential: {String(effectiveProfileResearch.scorecard.potential_score ?? "-")} ·{" "}
                          Total: {String(effectiveProfileResearch.scorecard.total_score ?? "-")}
                        </p>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          Y1: {asText(asJsonMap(effectiveProfileResearch.scorecard.year_1_purchase_potential)?.low) || "-"} /{" "}
                          {asText(asJsonMap(effectiveProfileResearch.scorecard.year_1_purchase_potential)?.base) || "-"} /{" "}
                          {asText(asJsonMap(effectiveProfileResearch.scorecard.year_1_purchase_potential)?.high) || "-"}{" "}
                          {asText(asJsonMap(effectiveProfileResearch.scorecard.year_1_purchase_potential)?.currency) || ""}
                        </p>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          <strong>{lang === "sv" ? "Classification" : "Classification"}:</strong> {asText(effectiveProfileResearch.scorecard.classification) || "-"} ·{" "}
                          <strong>{lang === "sv" ? "Confidence" : "Confidence"}:</strong> {asText(effectiveProfileResearch.scorecard.confidence) || "-"}
                        </p>
                        {asTextArray(effectiveProfileResearch.scorecard.score_drivers).length > 0 ? (
                          <>
                            <h5 style={{ marginTop: "0.6rem", marginBottom: 0 }}>{lang === "sv" ? "Score drivers" : "Score drivers"}</h5>
                            <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                              {asTextArray(effectiveProfileResearch.scorecard.score_drivers).slice(0, 12).map((row, index) => (
                                <li key={`${row}-${index}`}>{row}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {asTextArray(effectiveProfileResearch.scorecard.assumptions).length > 0 ? (
                          <>
                            <h5 style={{ marginTop: "0.6rem", marginBottom: 0 }}>{lang === "sv" ? "Assumptions" : "Assumptions"}</h5>
                            <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                              {asTextArray(effectiveProfileResearch.scorecard.assumptions).slice(0, 12).map((row, index) => (
                                <li key={`${row}-${index}`}>{row}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </article>

                      {Object.keys(effectiveProfileResearch.growth).length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Growth opportunities for Vendora" : "Growth opportunities for Vendora"}</h4>
                          {[
                            { key: "underpenetrated_areas", label: "Underpenetrated areas" },
                            { key: "quick_wins", label: "Quick wins" },
                            { key: "strategic_bets", label: "Strategic bets" },
                            { key: "why_now", label: "Why now" }
                          ].map((group) =>
                            asTextArray(effectiveProfileResearch.growth[group.key]).length > 0 ? (
                              <div key={group.key} style={{ marginTop: "0.55rem" }}>
                                <h5 style={{ margin: 0 }}>{group.label}</h5>
                                <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                                  {asTextArray(effectiveProfileResearch.growth[group.key]).slice(0, 12).map((row, index) => (
                                    <li key={`${row}-${index}`}>{row}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null
                          )}
                        </article>
                      ) : null}

                      {effectiveProfileResearch.categories.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Recommended categories to pitch" : "Recommended categories to pitch"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {effectiveProfileResearch.categories.slice(0, 20).map((item, index) => (
                              <li key={`${asText(item.category_or_brand) || "cat"}-${index}`}>
                                <strong>{asText(item.category_or_brand) || "-"}</strong>
                                {asText(item.why_it_fits) ? ` - ${asText(item.why_it_fits)}` : ""}
                                {asText(item.maps_to_customer_need) ? ` | Need: ${asText(item.maps_to_customer_need)}` : ""}
                                {asText(item.opportunity_level) ? ` | ${asText(item.opportunity_level)}` : ""}
                                {asText(item.confidence) ? ` | ${asText(item.confidence)}` : ""}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ) : null}

                      {Object.keys(effectiveProfileResearch.contactPaths).length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Contact paths" : "Contact paths"}</h4>
                          {asJsonArray(effectiveProfileResearch.contactPaths.named_contacts).length > 0 ? (
                            <>
                              <h5 style={{ marginTop: "0.55rem", marginBottom: 0 }}>{lang === "sv" ? "Named contacts" : "Named contacts"}</h5>
                              <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                                {asJsonArray(effectiveProfileResearch.contactPaths.named_contacts)
                                  .map((row) => asJsonMap(row))
                                  .filter((row): row is JsonMap => Boolean(row))
                                  .slice(0, 12)
                                  .map((row, index) => (
                                    <li key={`${asText(row.name) || "named"}-${index}`}>
                                      <strong>{asText(row.name) || "-"}</strong>
                                      {asText(row.role) ? ` (${asText(row.role)})` : ""}
                                      {asText(row.source_note) ? ` - ${asText(row.source_note)}` : ""}
                                      {asText(row.confidence) ? ` | ${asText(row.confidence)}` : ""}
                                    </li>
                                  ))}
                              </ul>
                            </>
                          ) : null}
                          {asJsonArray(effectiveProfileResearch.contactPaths.role_based_paths).length > 0 ? (
                            <>
                              <h5 style={{ marginTop: "0.55rem", marginBottom: 0 }}>{lang === "sv" ? "Role based paths" : "Role based paths"}</h5>
                              <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                                {asJsonArray(effectiveProfileResearch.contactPaths.role_based_paths)
                                  .map((row) => asJsonMap(row))
                                  .filter((row): row is JsonMap => Boolean(row))
                                  .slice(0, 12)
                                  .map((row, index) => (
                                    <li key={`${asText(row.function) || "role"}-${index}`}>
                                      <strong>{asText(row.function) || "-"}</strong>
                                      {asText(row.why_relevant) ? ` - ${asText(row.why_relevant)}` : ""}
                                      {asText(row.likely_entry_path) ? ` | ${asText(row.likely_entry_path)}` : ""}
                                      {asText(row.likely_email_pattern) ? ` | ${asText(row.likely_email_pattern)}` : ""}
                                      {asText(row.confidence) ? ` | ${asText(row.confidence)}` : ""}
                                    </li>
                                  ))}
                              </ul>
                            </>
                          ) : null}
                          {asText(effectiveProfileResearch.contactPaths.fallback_path) ? (
                            <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                              <strong>Fallback:</strong> {asText(effectiveProfileResearch.contactPaths.fallback_path)}
                            </p>
                          ) : null}
                        </article>
                      ) : null}

                      {Object.keys(effectiveProfileResearch.recommendedPitch).length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Recommended pitch" : "Recommended pitch"}</h4>
                          <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                            <strong>{lang === "sv" ? "Opening narrative" : "Opening narrative"}:</strong> {asText(effectiveProfileResearch.recommendedPitch.opening_narrative) || "-"}
                          </p>
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            <strong>{lang === "sv" ? "Why it should resonate" : "Why it should resonate"}:</strong> {asText(effectiveProfileResearch.recommendedPitch.why_it_should_resonate) || "-"}
                          </p>
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            <strong>{lang === "sv" ? "Lead category" : "Lead category"}:</strong> {asText(effectiveProfileResearch.recommendedPitch.lead_category) || "-"}
                          </p>
                          {asTextArray(effectiveProfileResearch.recommendedPitch.key_proof_points).length > 0 ? (
                            <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                              {asTextArray(effectiveProfileResearch.recommendedPitch.key_proof_points).slice(0, 12).map((row, index) => (
                                <li key={`${row}-${index}`}>{row}</li>
                              ))}
                            </ul>
                          ) : null}
                        </article>
                      ) : null}

                      {Object.keys(effectiveProfileResearch.outreachAssets).length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Outreach assets" : "Outreach assets"}</h4>
                          {asTextArray(effectiveProfileResearch.outreachAssets.subject_lines).length > 0 ? (
                            <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
                              <strong>{lang === "sv" ? "Subject lines" : "Subject lines"}:</strong> {asTextArray(effectiveProfileResearch.outreachAssets.subject_lines).join(" | ")}
                            </p>
                          ) : null}
                          {asText(effectiveProfileResearch.outreachAssets.short_intro_email) ? (
                            <div style={{ marginTop: "0.45rem" }}>
                              <p className="crm-subtle" style={{ margin: 0 }}><strong>{lang === "sv" ? "Short intro email" : "Short intro email"}</strong></p>
                              <pre className="crm-pre" style={{ marginTop: "0.35rem" }}>{asText(effectiveProfileResearch.outreachAssets.short_intro_email)}</pre>
                            </div>
                          ) : null}
                          {asText(effectiveProfileResearch.outreachAssets.consultative_email) ? (
                            <div style={{ marginTop: "0.45rem" }}>
                              <p className="crm-subtle" style={{ margin: 0 }}><strong>{lang === "sv" ? "Consultative email" : "Consultative email"}</strong></p>
                              <pre className="crm-pre" style={{ marginTop: "0.35rem" }}>{asText(effectiveProfileResearch.outreachAssets.consultative_email)}</pre>
                            </div>
                          ) : null}
                          {asJsonMap(effectiveProfileResearch.outreachAssets.call_script) ? (
                            <div style={{ marginTop: "0.45rem" }}>
                              <p className="crm-subtle" style={{ margin: 0 }}><strong>{lang === "sv" ? "Call script" : "Call script"}</strong></p>
                              {asTextArray(asJsonMap(effectiveProfileResearch.outreachAssets.call_script)?.call_structure).length > 0 ? (
                                <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                                  {asTextArray(asJsonMap(effectiveProfileResearch.outreachAssets.call_script)?.call_structure).slice(0, 12).map((row, index) => (
                                    <li key={`${row}-${index}`}>{row}</li>
                                  ))}
                                </ul>
                              ) : null}
                              {asTextArray(asJsonMap(effectiveProfileResearch.outreachAssets.call_script)?.discovery_questions).length > 0 ? (
                                <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                                  {asTextArray(asJsonMap(effectiveProfileResearch.outreachAssets.call_script)?.discovery_questions).slice(0, 12).map((row, index) => (
                                    <li key={`${row}-${index}`}>{row}</li>
                                  ))}
                                </ul>
                              ) : null}
                              {asText(asJsonMap(effectiveProfileResearch.outreachAssets.call_script)?.recommended_close) ? (
                                <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                                  <strong>{lang === "sv" ? "Recommended close" : "Recommended close"}:</strong> {asText(asJsonMap(effectiveProfileResearch.outreachAssets.call_script)?.recommended_close)}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      ) : null}

                      {Object.keys(effectiveProfileResearch.risks).length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Risks and barriers" : "Risks and barriers"}</h4>
                          {[
                            { key: "main_risks", label: "Main risks" },
                            { key: "open_questions", label: "Open questions" },
                            { key: "confidence_gaps", label: "Confidence gaps" }
                          ].map((group) =>
                            asTextArray(effectiveProfileResearch.risks[group.key]).length > 0 ? (
                              <div key={group.key} style={{ marginTop: "0.55rem" }}>
                                <h5 style={{ margin: 0 }}>{group.label}</h5>
                                <ul style={{ marginTop: "0.35rem", paddingLeft: "1.1rem" }}>
                                  {asTextArray(effectiveProfileResearch.risks[group.key]).slice(0, 12).map((row, index) => (
                                    <li key={`${row}-${index}`}>{row}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null
                          )}
                        </article>
                      ) : null}

                      {effectiveProfileResearch.nextBestActions.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Next best actions" : "Next best actions"}</h4>
                          <ol style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {effectiveProfileResearch.nextBestActions.slice(0, 20).map((step, index) => (
                              <li key={`${step}-${index}`}>{step}</li>
                            ))}
                          </ol>
                        </article>
                      ) : null}

                      {effectiveProfileResearch.evidenceLog.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Evidence log" : "Evidence log"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {effectiveProfileResearch.evidenceLog.slice(0, 30).map((entry, index) => {
                              const sourceUrl = asText(entry.source_url);
                              const sourceType = asText(entry.source_type);
                              const snippet = asText(entry.evidence_snippet);
                              const usedFor = asTextArray(entry.used_for);
                              return (
                                <li key={`${sourceUrl || "evidence"}-${index}`}>
                                  {sourceUrl ? (
                                    <a href={sourceUrl} target="_blank" rel="noreferrer" className="crm-link-inline">
                                      {sourceUrl}
                                    </a>
                                  ) : (
                                    <span>-</span>
                                  )}
                                  {sourceType ? ` | ${sourceType}` : ""}
                                  {usedFor.length > 0 ? ` | ${usedFor.join(", ")}` : ""}
                                  {snippet ? ` | ${snippet}` : ""}
                                </li>
                              );
                            })}
                          </ul>
                        </article>
                      ) : null}

                      {result.savedInsight ? (
                        <article className="crm-item">
                          <p className="crm-subtle">
                            {lang === "sv" ? "Sparat på kund" : "Saved on customer"} · Potential: {result.savedInsight.potentialScore} · {new Date(result.savedInsight.updatedAt).toLocaleString()}
                          </p>
                        </article>
                      ) : null}

                      {result.usedExtraInstructions ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Extra instruktion som användes" : "Extra instruction used"}</h4>
                          <pre className="crm-pre" style={{ marginTop: "0.4rem" }}>{result.usedExtraInstructions}</pre>
                        </article>
                      ) : null}

                      {result.aiResult?.outputText ? (
                        <article className="crm-item">
                          <details>
                            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                              {lang === "sv" ? "Visa rå AI-output (fallback)" : "Show raw AI output (fallback)"}
                            </summary>
                            <pre className="crm-pre" style={{ marginTop: "0.55rem" }}>{result.aiResult.outputText}</pre>
                          </details>
                        </article>
                      ) : null}
                    </div>
                  ) : result.structuredInsight ? (
                    <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                      <article className="crm-item">
                        <p><strong>{lang === "sv" ? "Sammanfattning" : "Summary"}:</strong> {result.structuredInsight.summary || "-"}</p>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          Fit: {result.structuredInsight.fitScore ?? "-"} · {lang === "sv" ? "Sortimentsfit" : "Assortment fit"}: {result.structuredInsight.assortmentFitScore ?? "-"} · Potential: {result.structuredInsight.potentialScore ?? "-"} · Total: {result.structuredInsight.totalScore ?? "-"} · {lang === "sv" ? "Säkerhet" : "Confidence"}: {result.structuredInsight.confidence ?? "-"}
                        </p>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                          Y1: {result.structuredInsight.year1Potential?.low || "-"} / {result.structuredInsight.year1Potential?.base || "-"} / {result.structuredInsight.year1Potential?.high || "-"} {result.structuredInsight.year1Potential?.currency || ""}
                        </p>
                        {result.structuredInsight.commercialRelevance ? (
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            {result.structuredInsight.commercialRelevance}
                          </p>
                        ) : null}
                        {Array.isArray(result.structuredInsight.segmentChannelProfile) && result.structuredInsight.segmentChannelProfile.length > 0 ? (
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.structuredInsight.segmentChannelProfile.slice(0, 6).map((line, index) => (
                              <li key={`${line}-${index}`}>{line}</li>
                            ))}
                          </ul>
                        ) : null}
                        {result.savedInsight ? (
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            {lang === "sv" ? "Sparat på kund" : "Saved on customer"} · Potential: {result.savedInsight.potentialScore} · {new Date(result.savedInsight.updatedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </article>
                      {Array.isArray(result.structuredInsight.categoriesToPitch) && result.structuredInsight.categoriesToPitch.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Prioriterade produktområden" : "Priority product areas"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.structuredInsight.categoriesToPitch.slice(0, 10).map((item, index) => (
                              <li key={`${item.categoryOrBrand || "item"}-${index}`}>
                                <strong>{item.categoryOrBrand || "-"}</strong>
                                {item.whyItFits ? ` - ${item.whyItFits}` : ""}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                      {Array.isArray(result.structuredInsight.nextBestActions) && result.structuredInsight.nextBestActions.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Nästa steg" : "Next steps"}</h4>
                          <ol style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.structuredInsight.nextBestActions.slice(0, 10).map((step, index) => (
                              <li key={`${step}-${index}`}>{step}</li>
                            ))}
                          </ol>
                        </article>
                      ) : null}
                      {Array.isArray(result.structuredInsight.scoreDrivers) && result.structuredInsight.scoreDrivers.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Scoredrivare" : "Score drivers"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.structuredInsight.scoreDrivers.slice(0, 8).map((driver, index) => (
                              <li key={`${driver}-${index}`}>{driver}</li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                      {Array.isArray(result.structuredInsight.assumptions) && result.structuredInsight.assumptions.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Antaganden" : "Assumptions"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.structuredInsight.assumptions.slice(0, 8).map((assumption, index) => (
                              <li key={`${assumption}-${index}`}>{assumption}</li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                      {Array.isArray(result.structuredInsight.contactPaths?.roleBasedPaths) &&
                      result.structuredInsight.contactPaths?.roleBasedPaths &&
                      result.structuredInsight.contactPaths.roleBasedPaths.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Kontaktvägar" : "Contact paths"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.structuredInsight.contactPaths.roleBasedPaths.slice(0, 6).map((path, index) => (
                              <li key={`${path.function || "path"}-${index}`}>
                                <strong>{path.function || "-"}</strong>
                                {path.entryPath ? ` - ${path.entryPath}` : ""}
                                {path.confidence ? ` (${path.confidence})` : ""}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                      {Array.isArray(result.companySignals) && result.companySignals.length > 0 ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Källor som användes" : "Sources used"}</h4>
                          <ul style={{ marginTop: "0.45rem", paddingLeft: "1.1rem" }}>
                            {result.companySignals.slice(0, 12).map((signal, index) => (
                              <li key={`${signal.url}-${index}`}>
                                <a href={signal.url} target="_blank" rel="noreferrer" className="crm-link-inline">
                                  {signal.title || signal.url}
                                </a>
                                {signal.sourceType ? ` (${signal.sourceType})` : ""}
                              </li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                      {result.aiResult?.outputText ? (
                        <article className="crm-item">
                          <details>
                            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                              {lang === "sv" ? "Visa rå AI-output" : "Show raw AI output"}
                            </summary>
                            {aiSections.length > 0 ? (
                              <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                                {aiSections.map((section) => (
                                  <article key={section.title} className="crm-item">
                                    <h5 style={{ margin: 0 }}>{section.title}</h5>
                                    <pre className="crm-pre" style={{ marginTop: "0.4rem" }}>{section.body}</pre>
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <pre className="crm-pre" style={{ marginTop: "0.55rem" }}>{result.aiResult.outputText}</pre>
                            )}
                          </details>
                        </article>
                      ) : null}
                      {result.usedExtraInstructions ? (
                        <article className="crm-item">
                          <h4 style={{ margin: 0 }}>{lang === "sv" ? "Extra instruktion som användes" : "Extra instruction used"}</h4>
                          <pre className="crm-pre" style={{ marginTop: "0.4rem" }}>{result.usedExtraInstructions}</pre>
                        </article>
                      ) : null}
                    </div>
                  ) : result.aiResult?.outputText ? (
                    <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                      <article className="crm-item">
                        <p className="crm-subtle" style={{ margin: 0 }}>
                          {lang === "sv"
                            ? "Kunde inte normalisera AI-svaret till strukturerad visning. Visa rå output för felsökning nedan."
                            : "Could not normalize AI response into structured view. Show raw output for debugging below."}
                        </p>
                        <details style={{ marginTop: "0.45rem" }}>
                          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                            {lang === "sv" ? "Visa rå AI-output" : "Show raw AI output"}
                          </summary>
                          {aiSections.length > 0 ? (
                            <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                              {aiSections.map((section) => (
                                <article key={section.title} className="crm-item">
                                  <h4 style={{ margin: 0 }}>{section.title}</h4>
                                  <pre className="crm-pre" style={{ marginTop: "0.4rem" }}>{section.body}</pre>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <pre className="crm-pre" style={{ marginTop: "0.55rem" }}>{result.aiResult.outputText}</pre>
                          )}
                        </details>
                      </article>
                    </div>
                  ) : (
                    <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>
                      {lang === "sv" ? "Ingen analys tillgänglig ännu." : "No analysis available yet."}
                    </p>
                  )}
                </section>
              ) : (
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
                    {result.structuredInsight ? (
                      <div className="crm-list" style={{ marginTop: "0.6rem" }}>
                        <article className="crm-item">
                          <p><strong>{lang === "sv" ? "Sammanfattning" : "Summary"}:</strong> {result.structuredInsight.summary || "-"}</p>
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            Fit: {result.structuredInsight.fitScore ?? "-"} · Potential: {result.structuredInsight.potentialScore ?? "-"} · Total: {result.structuredInsight.totalScore ?? "-"} · {lang === "sv" ? "Säkerhet" : "Confidence"}: {result.structuredInsight.confidence ?? "-"}
                          </p>
                          <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>
                            Y1: {result.structuredInsight.year1Potential?.low || "-"} / {result.structuredInsight.year1Potential?.base || "-"} / {result.structuredInsight.year1Potential?.high || "-"} {result.structuredInsight.year1Potential?.currency || ""}
                          </p>
                        </article>
                      </div>
                    ) : null}
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
              )}
            </>
          ) : null}
        </>
      ) : null}

      {adminMode && tab === "settings" ? (
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
              className={`crm-tab ${settingsTab === "sources" ? "active" : ""}`}
              onClick={() => setSettingsTab("sources")}
            >
              {lang === "sv" ? "Källor" : "Sources"}
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

            <section style={{ display: settingsTab === "sources" ? "block" : "none" }}>
              <div className="crm-row">
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Prioriterade källdomäner (en per rad)" : "Preferred source domains (one per line)"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="preferredSourceDomains"
                  defaultValue={config.preferredSourceDomains.join("\n")}
                  placeholder="allabolag.se"
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Blockerade domäner (en per rad)" : "Blocked domains (one per line)"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="blockedSourceDomains"
                  defaultValue={config.blockedSourceDomains.join("\n")}
                  placeholder="glassdoor.com"
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Företagsregister-källor (URL, en per rad)" : "Company registry sources (URL, one per line)"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="registrySourceUrls"
                  defaultValue={config.registrySourceUrls.join("\n")}
                  placeholder="https://www.allabolag.se"
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="pxwebBaseUrl"
                  defaultValue={config.pxwebBaseUrl}
                  placeholder={lang === "sv" ? "PxWeb base URL (t.ex. https://api.scb.se/OV0104/v2beta/api/v1/sv)" : "PxWeb base URL (e.g. https://api.scb.se/OV0104/v2beta/api/v1/sv)"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="pxwebSniTablePath"
                  defaultValue={config.pxwebSniTablePath}
                  placeholder={lang === "sv" ? "PxWeb tabell-path för SNI (utan inledande /)" : "PxWeb SNI table path (without leading /)"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="pxwebSniVariable"
                  defaultValue={config.pxwebSniVariable}
                  placeholder={lang === "sv" ? "SNI-variabelkod (t.ex. SNI2007)" : "SNI variable code (e.g. SNI2007)"}
                />
                <input
                  className="crm-input"
                  name="pxwebRegionVariable"
                  defaultValue={config.pxwebRegionVariable}
                  placeholder={lang === "sv" ? "Region-variabelkod (t.ex. Region)" : "Region variable code (e.g. Region)"}
                />
                <input
                  className="crm-input"
                  name="pxwebTimeVariable"
                  defaultValue={config.pxwebTimeVariable}
                  placeholder={lang === "sv" ? "Tid-variabelkod (t.ex. Tid)" : "Time variable code (e.g. Tid)"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <input
                  className="crm-input"
                  name="pxwebContentVariable"
                  defaultValue={config.pxwebContentVariable}
                  placeholder={lang === "sv" ? "Innehålls-variabelkod (t.ex. ContentsCode)" : "Content variable code (e.g. ContentsCode)"}
                />
                <input
                  className="crm-input"
                  name="pxwebDefaultContentCode"
                  defaultValue={config.pxwebDefaultContentCode}
                  placeholder={lang === "sv" ? "Default content-kod (valfri)" : "Default content code (optional)"}
                />
              </div>
            </section>

            <section style={{ display: settingsTab === "prompts" ? "block" : "none" }}>
              <div className="crm-row">
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Global system-prompt" : "Global system prompt"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="globalSystemPrompt"
                  defaultValue={config.globalSystemPrompt}
                  placeholder={lang === "sv" ? "Global systemprompt för alla AI-körningar" : "Global system prompt for all AI runs"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Full research-prompt" : "Full research prompt"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="fullResearchPrompt"
                  defaultValue={config.fullResearchPrompt}
                  placeholder={lang === "sv" ? "Prompt för komplett research" : "Prompt for full research"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Similar-customers prompt" : "Similar-customers prompt"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="similarCustomersPrompt"
                  defaultValue={config.similarCustomersPrompt}
                  placeholder={
                    lang === "sv"
                      ? "Frågeprompt: Find similar customers (AI)"
                      : "Question prompt: Find similar customers (AI)"
                  }
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Follow-up on customer click prompt" : "Follow-up on customer click prompt"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="followupCustomerClickPrompt"
                  defaultValue={config.followupCustomerClickPrompt}
                  placeholder={
                    lang === "sv"
                      ? "Fördjupningsprompt när du klickar en kund i resultatlistan"
                      : "Follow-up prompt when clicking a customer in the result list"
                  }
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Extra instruktioner: snabb liknande-kundersökning" : "Extra instructions: quick similar search"}
                </p>
                <textarea
                  className="crm-textarea"
                  name="quickSimilarExtraInstructions"
                  defaultValue={config.quickSimilarExtraInstructions}
                  placeholder={lang === "sv" ? "Extra instruktioner för snabb liknande-kunder AI" : "Extra instructions for quick similar-customers AI"}
                />
              </div>
              <div className="crm-row" style={{ marginTop: "0.6rem" }}>
                <p className="crm-subtle" style={{ marginBottom: "0.35rem" }}>
                  {lang === "sv" ? "Extra AI-instruktioner (globalt)" : "Extra AI instructions (global)"}
                </p>
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
              <div style={{ marginTop: "0.8rem" }}>
                <div className="crm-item-head">
                  <p className="crm-subtle" style={{ margin: 0 }}>
                    {lang === "sv" ? "Användare och Slack Member ID" : "Users and Slack Member ID"}
                  </p>
                  <button
                    className="crm-button crm-button-secondary"
                    type="button"
                    onClick={loadAdminUsers}
                    disabled={usersLoading}
                  >
                    {usersLoading
                      ? (lang === "sv" ? "Uppdaterar..." : "Refreshing...")
                      : (lang === "sv" ? "Uppdatera lista" : "Refresh list")}
                  </button>
                </div>
                <div className="crm-list" style={{ marginTop: "0.5rem" }}>
                  {adminUsers.length === 0 ? (
                    <p className="crm-empty">
                      {usersLoading
                        ? (lang === "sv" ? "Laddar användare..." : "Loading users...")
                        : (lang === "sv"
                            ? "Inga användare hittades ännu. De visas efter första login."
                            : "No users found yet. Users appear after first login.")}
                    </p>
                  ) : (
                    adminUsers.map((user) => (
                      <article className="crm-item" key={user.id}>
                        <div className="crm-item-head">
                          <div className="crm-row" style={{ alignItems: "center", gap: "0.4rem" }}>
                            <strong>{user.name || user.email}</strong>
                            {user.isAdmin ? (
                              <span className="crm-badge" style={{ background: "#ecfdf3", borderColor: "#86efac", color: "#166534" }}>
                                {lang === "sv" ? "Admin" : "Admin"}
                              </span>
                            ) : null}
                          </div>
                          <span className="crm-subtle">
                            {user.lastLoginAt
                              ? `${lang === "sv" ? "Senast inloggad" : "Last login"}: ${new Date(user.lastLoginAt).toLocaleString()}`
                              : (lang === "sv" ? "Ingen inloggning ännu" : "No login yet")}
                          </span>
                        </div>
                        <p className="crm-subtle" style={{ marginTop: "0.35rem" }}>{user.email}</p>
                        <div className="crm-row" style={{ marginTop: "0.45rem" }}>
                          <input
                            className="crm-input"
                            value={userSlackDrafts[user.id] ?? ""}
                            onChange={(event) =>
                              setUserSlackDrafts((prev) => ({ ...prev, [user.id]: event.target.value }))
                            }
                            placeholder={lang === "sv" ? "Slack Member ID (t.ex. U01234567)" : "Slack Member ID (e.g. U01234567)"}
                          />
                          <button
                            className="crm-button crm-button-secondary"
                            type="button"
                            onClick={() => saveUserSlackMemberId(user.id)}
                          >
                            {lang === "sv" ? "Spara" : "Save"}
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
                {usersStatus ? <p className="crm-subtle" style={{ marginTop: "0.5rem" }}>{usersStatus}</p> : null}
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
