import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildResearchPrompt } from "@/lib/research/prompt";
import { rankSimilarCustomers } from "@/lib/research/similarity";
import { fetchWebsiteSnapshot, normalizeUrl } from "@/lib/research/web";
import { generateWithGemini } from "@/lib/research/llm";
import { getResearchConfig } from "@/lib/admin/settings";
import { discoverExternalSeeds } from "@/lib/research/discovery";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const VENDORA_RESELLER_URL = "https://reseller.vendora.se";

type Payload = {
  customerId?: string;
  companyName?: string;
  country?: string;
  region?: string;
  seller?: string;
  industry?: string;
  websites?: string[];
  scope?: "country" | "region";
  maxSimilar?: number;
  segmentFocus?: "B2B" | "B2C" | "MIXED";
  basePrompt?: string;
  extraInstructions?: string;
  externalOnly?: boolean;
  externalMode?: "similar" | "profile";
  allowCrmFallback?: boolean;
};

type SegmentFocus = "B2B" | "B2C" | "MIXED";
type SimilarCandidate = {
  id: string;
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
  similarityScore?: number | null;
  alreadyCustomer?: boolean;
  existingCustomerId?: string | null;
  existingCustomerName?: string | null;
};

type CompanySignal = {
  title: string;
  url: string;
  snippet: string;
  sourceType: "serper" | "tavily";
};

type ContactSignal = {
  name: string;
  role: string;
  sourceUrl: string;
  sourceType: "serper" | "tavily";
  snippet: string;
  confidence: "High" | "Medium" | "Low";
  verificationStatus: "Verified" | "NeedsValidation";
};

type WebsiteSourceAttribution = {
  url: string;
  title: string | null;
  origins: string[];
};

type ResearchSourceAttribution = {
  web?: WebsiteSourceAttribution[];
  externalSignals?: Array<{ sourceType?: string; url?: string; title?: string }>;
  contacts?: Array<{
    name?: string;
    role?: string;
    sourceUrl?: string;
    sourceType?: string;
    confidence?: string;
    verificationStatus?: string;
  }>;
  crm?: {
    contactsCount?: number;
    plansCount?: number;
    activitiesCount?: number;
    salesRecordsCount?: number;
    manualBrandRevenueCount?: number;
    hasPriorResearch?: boolean;
    customerUpdatedAt?: string | null;
  } | null;
  discovery?: {
    providers?: string[];
    seedCount?: number;
  } | null;
};
type MinimalCustomer = {
  id: string;
  name: string;
  registrationNumber: string | null;
  naceCode: string | null;
  country: string | null;
  region: string | null;
  industry: string | null;
  seller: string | null;
  notes?: string | null;
  potentialScore: number;
  website?: string | null;
  webshopSignals?: unknown;
};

type CustomerResearchContext = {
  customer: {
    id: string;
    name: string;
    registrationNumber: string | null;
    naceCode: string | null;
    country: string | null;
    region: string | null;
    industry: string | null;
    seller: string | null;
    website: string | null;
    potentialScore: number;
    notes: string | null;
    updatedAt: string;
  } | null;
  contacts: Array<{
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    department: string | null;
    title: string | null;
    role: string | null;
    notes: string | null;
    updatedAt: string;
  }>;
  plans: Array<{
    title: string;
    description: string | null;
    status: string;
    priority: string;
    owner: string | null;
    startDate: string | null;
    endDate: string | null;
    updatedAt: string;
  }>;
  activities: Array<{
    type: string;
    message: string;
    actorName: string | null;
    createdAt: string;
    metadata: unknown;
  }>;
  salesRecords: Array<{
    source: string;
    periodStart: string;
    periodEnd: string;
    currency: string;
    netSales: number | null;
    grossMargin: number | null;
    unitsSold: number | null;
    ordersCount: number | null;
    updatedAt: string;
  }>;
  manualBrandRevenue: Array<{
    brand: string;
    revenue: number;
    currency: string;
    year: number;
    updatedAt: string | null;
    updatedBy: string | null;
  }>;
  priorResearch: Record<string, unknown> | null;
};

type ExistingCustomerRef = {
  id: string;
  name: string;
  domain: string;
};

function compactWebsiteSnapshotsForPrompt(
  snapshots: Array<{
    url: string;
    title: string | null;
    description: string | null;
    h1: string | null;
    textSample: string;
    vendoraFitScore: number;
  }>
) {
  return snapshots.map((snapshot) => ({
    url: snapshot.url,
    title: snapshot.title,
    description: snapshot.description,
    h1: snapshot.h1,
    textSample: String(snapshot.textSample ?? "").slice(0, 420),
    vendoraFitScore: snapshot.vendoraFitScore
  }));
}

function compactWebsiteSnapshotsForRetry(
  snapshots: Array<{
    url: string;
    title: string | null;
    description: string | null;
    h1: string | null;
    textSample: string;
    vendoraFitScore: number;
  }>
) {
  return snapshots.map((snapshot) => ({
    url: snapshot.url,
    title: snapshot.title,
    description: snapshot.description,
    h1: snapshot.h1,
    vendoraFitScore: snapshot.vendoraFitScore
  }));
}

function readSessionToken(cookieHeader: string): string | null {
  const cookiePart = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookiePart) return null;
  const raw = cookiePart.slice(`${SESSION_COOKIE}=`.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function inferSegmentFocus(text: string): SegmentFocus {
  const normalized = text.toLowerCase();
  const b2bSignals = ["b2b", "enterprise", "business", "yritys", "pro", "corporate", "reseller"];
  const b2cSignals = ["b2c", "consumer", "retail", "ecommerce", "e-commerce", "shop", "store", "butik"];
  const b2bHits = b2bSignals.filter((signal) => normalized.includes(signal)).length;
  const b2cHits = b2cSignals.filter((signal) => normalized.includes(signal)).length;

  if (b2bHits > b2cHits && b2bHits > 0) return "B2B";
  if (b2cHits > b2bHits && b2cHits > 0) return "B2C";
  return "MIXED";
}

function segmentMatches(target: SegmentFocus, candidate: SegmentFocus): boolean {
  if (target === "MIXED") return true;
  if (candidate === "MIXED") return true;
  return target === candidate;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const parsed = extractJsonValue(text);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

function parseJsonLoose(candidate: string): unknown {
  const text = String(candidate ?? "").trim();
  if (!text) return null;
  const attempts: string[] = [text];
  const firstCurly = text.indexOf("{");
  const lastCurly = text.lastIndexOf("}");
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    attempts.push(text.slice(firstCurly, lastCurly + 1).trim());
  }
  const noTrailingComma = text.replace(/,\s*([}\]])/g, "$1");
  if (noTrailingComma !== text) attempts.push(noTrailingComma);
  if (firstCurly >= 0 && lastCurly > firstCurly) {
    const extractedNoTrailing = text.slice(firstCurly, lastCurly + 1).replace(/,\s*([}\]])/g, "$1").trim();
    attempts.push(extractedNoTrailing);
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      // continue
    }
  }

  return null;
}

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) candidates.push(fencedMatch[1].trim());
  const genericFence = trimmed.match(/```\s*([\s\S]*?)```/i);
  if (genericFence?.[1]) candidates.push(genericFence[1].trim());

  for (const candidate of candidates) {
    const parsed = parseJsonLoose(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

function uniqueNormalizedUrls(urls: Array<string | null | undefined>, max = 20): string[] {
  const out = new Set<string>();
  for (const value of urls) {
    const normalized = normalizeUrl(String(value ?? "").trim());
    if (!normalized) continue;
    out.add(normalized);
    if (out.size >= max) break;
  }
  return Array.from(out);
}

function clampScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function isVendoraWebsite(url: string | null | undefined): boolean {
  const host = websiteDomain(url);
  return host === "vendora.se" || host.endsWith(".vendora.se");
}

function extractAssortmentTerms(text: string, max = 80): string[] {
  const stopwords = new Set([
    "with", "from", "that", "this", "your", "more", "into", "about", "for", "and", "the", "to", "our", "you", "are",
    "som", "och", "det", "att", "med", "för", "till", "från", "hos", "på", "www", "http", "https", "com", "se", "app"
  ]);
  const terms = new Set<string>();
  for (const word of text.toLowerCase().match(/[a-z0-9åäö\-]{4,}/g) ?? []) {
    if (stopwords.has(word)) continue;
    terms.add(word);
    if (terms.size >= max) break;
  }
  return Array.from(terms);
}

function computeAssortmentFitScoreFromSnapshots(
  customerSnapshots: Array<{ title?: string | null; description?: string | null; h1?: string | null; textSample?: string | null }>,
  vendoraSnapshots: Array<{ title?: string | null; description?: string | null; h1?: string | null; textSample?: string | null }>
): number | null {
  const customerText = customerSnapshots
    .map((snapshot) => [snapshot.title, snapshot.description, snapshot.h1, snapshot.textSample].filter(Boolean).join(" "))
    .join(" ");
  if (!customerText.trim()) return null;

  const vendoraText = vendoraSnapshots
    .map((snapshot) => [snapshot.title, snapshot.description, snapshot.h1, snapshot.textSample].filter(Boolean).join(" "))
    .join(" ");
  const vendoraFallback = [
    "satechi", "alogic", "uag", "paperlike", "nomad", "twelve", "charging", "charger", "usb", "hub", "dock", "adapter",
    "mobile", "iphone", "ipad", "mac", "smart", "home", "audio", "office", "accessories", "retail", "reseller"
  ];
  const vendoraTerms = new Set([...extractAssortmentTerms(vendoraText, 120), ...vendoraFallback]);
  const customerTerms = new Set(extractAssortmentTerms(customerText, 180));
  if (vendoraTerms.size === 0 || customerTerms.size === 0) return null;

  let overlap = 0;
  for (const term of customerTerms) {
    if (vendoraTerms.has(term)) overlap += 1;
  }
  const ratio = overlap / Math.max(1, Math.min(vendoraTerms.size, customerTerms.size));
  const boosted = Math.min(1, ratio * 1.7);
  return clampScore(Math.round(boosted * 100), 50);
}

type StructuredResearchInsight = {
  summary: string;
  segmentChannelProfile: string[];
  commercialRelevance: string;
  verificationStatus: "Verified" | "Estimated" | "NeedsValidation";
  confidence: "High" | "Medium" | "Low";
  fitScore: number | null;
  assortmentFitScore: number | null;
  potentialScore: number | null;
  totalScore: number | null;
  year1Potential: {
    low: string;
    base: string;
    high: string;
    currency: string;
  };
  categoriesToPitch: Array<{
    categoryOrBrand: string;
    whyItFits: string;
    opportunityLevel: string;
  }>;
  contactPaths: {
    namedContacts: Array<{ name: string; role: string; sourceNote: string; confidence: string }>;
    roleBasedPaths: Array<{ function: string; entryPath: string; confidence: string }>;
    fallbackPath: string;
  };
  scoreDrivers: string[];
  assumptions: string[];
  nextBestActions: string[];
  raw: Record<string, unknown>;
};

type ResearchAutofill = {
  registrationNumber?: string;
  naceCode?: string;
  industry?: string;
  region?: string;
  website?: string;
};

function normalizeVerification(value: unknown): StructuredResearchInsight["verificationStatus"] {
  const normalized = asString(value).toLowerCase();
  if (normalized.startsWith("verified")) return "Verified";
  if (normalized.startsWith("needs")) return "NeedsValidation";
  return "Estimated";
}

function normalizeConfidence(value: unknown): StructuredResearchInsight["confidence"] {
  const normalized = asString(value).toLowerCase();
  if (normalized.startsWith("high")) return "High";
  if (normalized.startsWith("med")) return "Medium";
  return "Low";
}

function parseStructuredResearchInsight(outputText: string): StructuredResearchInsight | null {
  const parsed = extractJsonValue(outputText);
  const root = asObject(parsed);
  if (!root) return null;

  // Support both flat format (expected) and account_intelligence wrapper (Claude V2.2 fallback)
  const aiWrapper = asObject(root.account_intelligence);
  const flatRoot = aiWrapper ? aiWrapper : root;

  const summaryObj =
    asObject(flatRoot.target_account_summary) ??
    asObject(flatRoot.account_summary) ??
    asObject(aiWrapper?.company_profile) ??
    {};
  const aiCommercialAnalysis = asObject(aiWrapper?.commercial_analysis);
  const scoreObj =
    asObject(flatRoot.vendora_match_scorecard) ??
    asObject(flatRoot.vendora_fit_scorecard) ??
    asObject(aiWrapper?.vendora_fit_scorecard) ??
    asObject(aiCommercialAnalysis?.scorecard) ??
    {};
  const yearObj = asObject(scoreObj.year_1_purchase_potential) ?? {};

  const categoriesRows = asArray(flatRoot.best_categories_to_pitch).length
    ? asArray(flatRoot.best_categories_to_pitch)
    : asArray(flatRoot.recommended_categories_to_pitch).length
    ? asArray(flatRoot.recommended_categories_to_pitch)
    : asArray(aiWrapper?.recommended_categories_to_pitch).length
    ? asArray(aiWrapper?.recommended_categories_to_pitch)
    : asArray(aiWrapper?.best_categories_to_pitch);
  const namedContactsRows = asArray(asObject(flatRoot.contact_paths)?.named_contacts);
  const rolePathsRows = asArray(asObject(flatRoot.contact_paths)?.role_based_paths);

  // For account_intelligence company_profile, derive summary from legal_name + website
  const aiSummaryFallback = aiWrapper
    ? [asString(summaryObj.legal_name), asString(summaryObj.website)].filter(Boolean).join(" · ")
    : "";
  const summary = asString(summaryObj.summary) || aiSummaryFallback;
  const segmentChannelProfile = asStringArray(summaryObj.segment_channel_profile);
  const commercialRelevance = asString(summaryObj.commercial_relevance_for_vendora);
  const fitScore = Number.isFinite(Number(scoreObj.fit_score)) ? clampScore(scoreObj.fit_score, 0) : null;
  const assortmentFitScore = Number.isFinite(Number(scoreObj.assortment_fit_score))
    ? clampScore(scoreObj.assortment_fit_score, 0)
    : Number.isFinite(Number(scoreObj.assortmentFitScore))
    ? clampScore(scoreObj.assortmentFitScore, 0)
    : fitScore;
  const potentialScore = Number.isFinite(Number(scoreObj.potential_score)) ? clampScore(scoreObj.potential_score, 0) : null;
  const totalScore = Number.isFinite(Number(scoreObj.total_score)) ? clampScore(scoreObj.total_score, 0) : null;

  const insight: StructuredResearchInsight = {
    summary,
    segmentChannelProfile,
    commercialRelevance,
    verificationStatus: normalizeVerification(summaryObj.verification_status),
    confidence: normalizeConfidence(summaryObj.confidence || scoreObj.confidence),
    fitScore,
    assortmentFitScore,
    potentialScore,
    totalScore,
    year1Potential: {
      low: asString(yearObj.low),
      base: asString(yearObj.base),
      high: asString(yearObj.high),
      currency: asString(yearObj.currency) || "SEK"
    },
    categoriesToPitch: categoriesRows
      .map((row) => asObject(row))
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row) => ({
        categoryOrBrand: asString(row.category_or_brand),
        whyItFits: asString(row.why_it_fits),
        opportunityLevel: asString(row.opportunity_level) || "Medium"
      }))
      .filter((row) => row.categoryOrBrand),
    contactPaths: {
      namedContacts: namedContactsRows
        .map((row) => asObject(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => ({
          name: asString(row.name),
          role: asString(row.role),
          sourceNote: asString(row.source_note),
          confidence: asString(row.confidence) || "Low"
        }))
        .filter((row) => row.name || row.role),
      roleBasedPaths: rolePathsRows
        .map((row) => asObject(row))
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => ({
          function: asString(row.function),
          entryPath: asString(row.likely_entry_path),
          confidence: asString(row.confidence) || "Low"
        }))
        .filter((row) => row.function || row.entryPath),
      fallbackPath: asString(asObject(root.contact_paths)?.fallback_path)
    },
    scoreDrivers: asStringArray(scoreObj.score_drivers),
    assumptions: asStringArray(scoreObj.assumptions),
    nextBestActions: asStringArray(flatRoot.next_best_actions).length
      ? asStringArray(flatRoot.next_best_actions)
      : asStringArray(aiWrapper?.next_best_actions),
    raw: root
  };

  // For account_intelligence format, lower the bar – company profile alone is useful
  const hasMinimumContent = aiWrapper
    ? Boolean(insight.summary)
    : !insight.summary &&
      !insight.commercialRelevance &&
      !insight.categoriesToPitch.length &&
      !insight.nextBestActions.length &&
      insight.totalScore === null;
  if (!aiWrapper && hasMinimumContent) {
    return null;
  }
  if (aiWrapper && !insight.summary) {
    return null;
  }

  return insight;
}

function parseRegionFromHeadquarters(value: string): string {
  const headquarters = asString(value);
  if (!headquarters) return "";
  const city = headquarters.split(",")[0]?.trim() ?? "";
  if (!city) return "";
  if (/^(sweden|norway|denmark|finland|estonia|latvia|lithuania|se|no|dk|fi|ee|lv|lt)$/i.test(city)) {
    return "";
  }
  return city.slice(0, 80);
}

function inferIndustryFromSegments(segments: string[]): string {
  const hay = segments.join(" ").toLowerCase();
  if (!hay) return "";
  if (/(consumer|retail|e-?commerce|marketplace|electronic|gadget|mobile|smart home)/i.test(hay)) {
    return "Consumer Electronics";
  }
  if (/(b2b|reseller|msp|integrator|enterprise|procurement)/i.test(hay)) {
    return "B2B IT Reseller";
  }
  if (/(office|workplace)/i.test(hay)) {
    return "Office Supplies & Workplace";
  }
  return "";
}

function extractResearchAutofill(raw: Record<string, unknown>): ResearchAutofill {
  const aiWrapper = asObject(raw.account_intelligence);
  const flatRoot = aiWrapper ?? raw;
  const accountSummary =
    asObject(flatRoot.account_summary) ??
    asObject(flatRoot.target_account_summary) ??
    asObject(aiWrapper?.company_profile) ??
    {};
  const segments = asStringArray(accountSummary.segment_channel_profile);
  const website = asString(accountSummary.website);
  const registrationNumber = asString(accountSummary.registration_number);
  const naceCode = asString(accountSummary.nace_code);
  const legalName = asString(accountSummary.legal_name);
  const hqRaw = accountSummary.headquarters;
  const headquarters =
    typeof hqRaw === "string"
      ? hqRaw
      : asObject(hqRaw)
      ? [asString((hqRaw as Record<string, unknown>).city), asString((hqRaw as Record<string, unknown>).region)].filter(Boolean).join(", ")
      : "";
  const inferredIndustry = inferIndustryFromSegments(segments);

  return {
    registrationNumber: registrationNumber || legalName || undefined,
    naceCode: naceCode || undefined,
    industry: inferredIndustry || undefined,
    region: parseRegionFromHeadquarters(headquarters) || undefined,
    website: website || undefined
  };
}

function hasRequiredDeepProfileShape(outputText: string): boolean {
  const parsed = extractJsonValue(outputText);
  const root = asObject(parsed);
  if (!root) return false;
  const aiWrapper = asObject(root.account_intelligence);
  const flatRoot = aiWrapper ?? root;
  const accountSummary =
    asObject(flatRoot.account_summary) ??
    asObject(flatRoot.target_account_summary) ??
    asObject(aiWrapper?.company_profile);
  const scorecard =
    asObject(flatRoot.vendora_fit_scorecard) ??
    asObject(flatRoot.vendora_match_scorecard) ??
    asObject(aiWrapper?.vendora_fit_scorecard);
  const categories = asArray(flatRoot.recommended_categories_to_pitch).length
    ? asArray(flatRoot.recommended_categories_to_pitch)
    : asArray(flatRoot.best_categories_to_pitch).length
    ? asArray(flatRoot.best_categories_to_pitch)
    : asArray(aiWrapper?.recommended_categories_to_pitch);
  const nextBestActions = asArray(flatRoot.next_best_actions).length
    ? asArray(flatRoot.next_best_actions)
    : asArray(aiWrapper?.next_best_actions);
  // account_intelligence format: accept if company_profile exists (scorecard may be absent)
  if (aiWrapper) return Boolean(accountSummary);
  return Boolean(accountSummary) && Boolean(scorecard) && categories.length > 0 && nextBestActions.length > 0;
}

async function saveResearchInsightToCustomer(
  customerId: string,
  insight: StructuredResearchInsight,
  model: string | null,
  ranBy: string | null,
  rawOutput: string | null,
  sourceAttribution: ResearchSourceAttribution | null = null
) {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      potentialScore: true,
      webshopSignals: true,
      notes: true,
      registrationNumber: true,
      naceCode: true,
      industry: true,
      region: true,
      website: true
    }
  });
  if (!existing) return null;

  const currentSignals = asObject(existing.webshopSignals) ?? {};
  const priorHistory = asArray(currentSignals.researchHistory)
    .map((item) => asObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  const runAt = new Date().toISOString();
  const historyEntry = {
    id: `rr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ranAt: runAt,
    ranBy: ranBy || null,
    model: model || null,
    summary: insight.summary,
    segmentChannelProfile: insight.segmentChannelProfile,
    commercialRelevance: insight.commercialRelevance,
    verificationStatus: insight.verificationStatus,
    confidence: insight.confidence,
    fitScore: insight.fitScore,
    assortmentFitScore: insight.assortmentFitScore,
    potentialScore: insight.potentialScore,
    totalScore: insight.totalScore,
    year1Potential: insight.year1Potential,
    categoriesToPitch: insight.categoriesToPitch,
    contactPaths: insight.contactPaths,
    scoreDrivers: insight.scoreDrivers,
    assumptions: insight.assumptions,
    nextBestActions: insight.nextBestActions,
    rawOutput: rawOutput || null,
    sourceAttribution: sourceAttribution || null
  };
  const historyWithLatest = [historyEntry, ...priorHistory];
  const latestEntry = historyWithLatest[0];
  const latestYear = new Date(asString(latestEntry?.ranAt) || runAt).getUTCFullYear();
  const seenYears = new Set<number>([latestYear]);
  const compactOlderHistory: Record<string, unknown>[] = [];
  for (const row of historyWithLatest.slice(1)) {
    const rowYear = new Date(asString(row?.ranAt) || runAt).getUTCFullYear();
    if (seenYears.has(rowYear)) continue;
    seenYears.add(rowYear);
    compactOlderHistory.push(row);
  }
  const nextHistory = [latestEntry, ...compactOlderHistory].filter(Boolean).slice(0, 12);
  const nextSignals = {
    ...currentSignals,
    research: {
      summary: insight.summary,
      segmentChannelProfile: insight.segmentChannelProfile,
      commercialRelevance: insight.commercialRelevance,
      verificationStatus: insight.verificationStatus,
      confidence: insight.confidence,
      fitScore: insight.fitScore,
      assortmentFitScore: insight.assortmentFitScore,
      potentialScore: insight.potentialScore,
      totalScore: insight.totalScore,
      year1Potential: insight.year1Potential,
      categoriesToPitch: insight.categoriesToPitch,
      contactPaths: insight.contactPaths,
      scoreDrivers: insight.scoreDrivers,
      assumptions: insight.assumptions,
      nextBestActions: insight.nextBestActions,
      sourceAttribution: sourceAttribution || null,
      model: model || null,
      updatedAt: runAt,
      updatedBy: ranBy || null
    },
    researchHistory: nextHistory
  };

  const autofill = extractResearchAutofill(insight.raw);
  (nextSignals as Record<string, unknown>).extractedAutofill = {
    registrationNumber: autofill.registrationNumber || null,
    naceCode: autofill.naceCode || null,
    industry: autofill.industry || null,
    region: autofill.region || null,
    website: autofill.website || null
  };
  const applyOrganization = !asString(existing.registrationNumber) && asString(autofill.registrationNumber);
  const applyNaceCode = !asString(existing.naceCode) && asString(autofill.naceCode);
  const applyIndustry = !asString(existing.industry) && asString(autofill.industry);
  const applyRegion = !asString(existing.region) && asString(autofill.region);
  const applyWebsite = !asString(existing.website) && asString(autofill.website);

  const nextPotential =
    insight.totalScore !== null ? clampScore(insight.totalScore, existing.potentialScore) : existing.potentialScore;

  const noteLine = insight.summary
    ? `[AI research ${runAt}${ranBy ? ` by ${ranBy}` : ""}] ${insight.summary}`
    : `[AI research ${runAt}${ranBy ? ` by ${ranBy}` : ""}] Research updated`;
  const prevNotes = asString(existing.notes);
  const mergedNotes = [noteLine, prevNotes].filter(Boolean).join("\n\n").slice(0, 12000);

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      potentialScore: nextPotential,
      notes: mergedNotes,
      webshopSignals: nextSignals as Prisma.InputJsonValue,
      registrationNumber: applyOrganization || undefined,
      naceCode: applyNaceCode || undefined,
      industry: applyIndustry || undefined,
      region: applyRegion || undefined,
      website: applyWebsite || undefined
    },
    select: {
      id: true,
      potentialScore: true,
      notes: true,
      webshopSignals: true,
      updatedAt: true
    }
  });
}

async function loadCustomerResearchContext(customerId: string): Promise<CustomerResearchContext | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      registrationNumber: true,
      naceCode: true,
      country: true,
      region: true,
      industry: true,
      seller: true,
      website: true,
      potentialScore: true,
      notes: true,
      updatedAt: true,
      webshopSignals: true
    }
  });
  if (!customer) return null;

  const [contacts, plans, activities, salesRecords] = await Promise.all([
    prisma.contact.findMany({
      where: { customerId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        department: true,
        title: true,
        role: true,
        notes: true,
        updatedAt: true
      }
    }),
    prisma.plan.findMany({
      where: { customerId },
      orderBy: [{ updatedAt: "desc" }],
      take: 40,
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        owner: true,
        startDate: true,
        endDate: true,
        updatedAt: true
      }
    }),
    prisma.activity.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        type: true,
        message: true,
        actorName: true,
        createdAt: true,
        metadata: true
      }
    }),
    prisma.salesRecord.findMany({
      where: { customerId },
      orderBy: { periodEnd: "desc" },
      take: 24,
      select: {
        source: true,
        periodStart: true,
        periodEnd: true,
        currency: true,
        netSales: true,
        grossMargin: true,
        unitsSold: true,
        ordersCount: true,
        updatedAt: true
      }
    })
  ]);

  const priorResearch = asObject(asObject(customer.webshopSignals)?.research) ?? null;
  const manualBrandRevenue = asArray(asObject(customer.webshopSignals)?.manualBrandRevenue)
    .map((row) => asObject(row))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      brand: asString(row.brand),
      revenue: Number.isFinite(Number(row.revenue)) ? Number(row.revenue) : 0,
      currency: asString(row.currency) || "SEK",
      year: Number.isFinite(Number(row.year)) ? Math.round(Number(row.year)) : new Date().getUTCFullYear(),
      updatedAt: asString(row.updatedAt) || null,
      updatedBy: asString(row.updatedBy) || null
    }))
    .filter((row) => row.brand && Number.isFinite(row.revenue) && row.revenue >= 0);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      registrationNumber: customer.registrationNumber,
      naceCode: customer.naceCode,
      country: customer.country,
      region: customer.region,
      industry: customer.industry,
      seller: customer.seller,
      website: customer.website,
      potentialScore: customer.potentialScore,
      notes: customer.notes,
      updatedAt: customer.updatedAt.toISOString()
    },
    contacts: contacts.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    plans: plans.map((row) => ({
      ...row,
      status: row.status,
      priority: row.priority,
      startDate: row.startDate ? row.startDate.toISOString() : null,
      endDate: row.endDate ? row.endDate.toISOString() : null,
      updatedAt: row.updatedAt.toISOString()
    })),
    activities: activities.map((row) => ({
      ...row,
      type: row.type,
      createdAt: row.createdAt.toISOString()
    })),
    salesRecords: salesRecords.map((row) => ({
      ...row,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    })),
    manualBrandRevenue,
    priorResearch
  };
}

function registryHintsForCountry(country: string | null): string[] {
  const normalized = (country || "").trim().toUpperCase();
  if (normalized === "SE") return ["Bolagsverket", "allabolag.se", "proff.se", "hitta.se/foretag"];
  if (normalized === "NO") return ["Brønnøysundregistrene", "proff.no", "gulesider.no/bedrifter"];
  if (normalized === "DK") return ["CVR (Virk)", "proff.dk", "krak.dk"];
  if (normalized === "FI") return ["YTJ", "Kauppalehti yritykset", "Finder.fi"];
  if (normalized === "EE") return ["e-Business Register", "Inforegister"];
  if (normalized === "LV") return ["Lursoft", "Firmas.lv"];
  if (normalized === "LT") return ["Registrų centras", "Rekvizitai.lt"];
  return ["Official company register", "national business directory", "industry directories"];
}

function likelySniGroupFromIndustry(industry: string | null): string[] {
  const value = String(industry ?? "").toLowerCase();
  if (!value) return [];
  if (value.includes("office") || value.includes("workplace")) return ["46.66", "47.59", "47.41"];
  if (value.includes("consumer electronics") || value.includes("electronics")) return ["46.43", "47.43", "47.41"];
  if (value.includes("it") || value.includes("reseller") || value.includes("e-commerce")) return ["46.51", "47.91", "62.09"];
  return [];
}

function domainMatchesCountry(domain: string, country: string | null): boolean {
  if (!domain) return false;
  const normalized = (country ?? "").trim().toUpperCase();
  if (!normalized) return true;
  if (normalized === "SE") return domain.endsWith(".se") || domain === "allabolag.se" || domain === "proff.se";
  if (normalized === "NO") return domain.endsWith(".no") || domain === "proff.no";
  if (normalized === "DK") return domain.endsWith(".dk") || domain === "proff.dk" || domain === "virk.dk";
  if (normalized === "FI") return domain.endsWith(".fi");
  if (normalized === "EE") return domain.endsWith(".ee");
  if (normalized === "LV") return domain.endsWith(".lv");
  if (normalized === "LT") return domain.endsWith(".lt");
  return true;
}

function normalizeCompanyName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(ab|as|a\/s|aps|oy|oü|ou|ltd|inc|llc|gmbh|bv|plc|srl|spa|sro|holding|group)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

function normalizedCompanyTokens(value: string | null | undefined): string[] {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ab|as|a\/s|aps|oy|ou|ltd|inc|llc|gmbh|bv|plc|srl|spa|sro|holding|group)\b/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function bigrams(value: string): Set<string> {
  const text = value.replace(/\s+/g, "");
  const out = new Set<string>();
  if (text.length < 2) {
    if (text) out.add(text);
    return out;
  }
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function fuzzyCompanyNameScore(a: string, b: string): number {
  const tokenA = new Set(normalizedCompanyTokens(a));
  const tokenB = new Set(normalizedCompanyTokens(b));
  const tokenScore = jaccardScore(tokenA, tokenB);
  const gramScore = jaccardScore(bigrams(normalizeCompanyName(a)), bigrams(normalizeCompanyName(b)));
  return tokenScore * 0.65 + gramScore * 0.35;
}

function websiteDomain(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

async function loadExistingCustomerRefs(): Promise<{
  refs: ExistingCustomerRef[];
  domains: string[];
  names: string[];
}> {
  const rows = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      website: true
    }
  });
  const refs: ExistingCustomerRef[] = [];
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  for (const row of rows) {
    const domain = websiteDomain(row.website);
    const normalizedName = row.name.trim();
    if (!normalizedName) continue;
    refs.push({
      id: row.id,
      name: normalizedName,
      domain
    });
    if (domain) seenDomains.add(domain);
    seenNames.add(normalizedName);
  }
  return {
    refs,
    domains: Array.from(seenDomains),
    names: Array.from(seenNames)
  };
}

function pathLooksLikeContentPage(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const path = `${url.pathname}${url.search}`.toLowerCase();
    if (!path || path === "/" || path.length <= 1) return false;
    const blockedParts = [
      "/review/",
      "/reviews/",
      "/careers",
      "/privacy",
      "/terms",
      "/blog/",
      "/news/",
      "/article/",
      "/report-",
      "/search/",
      "/category/",
      "/list/",
      "/ranking/",
      ".pdf",
      ".doc",
      ".ppt"
    ];
    if (path.split("/").filter(Boolean).length > 1) return true;
    return blockedParts.some((part) => path.includes(part));
  } catch {
    return true;
  }
}

function looksLikeCompanyName(value: string): boolean {
  const name = String(value ?? "").trim();
  if (!name || name.length < 3 || name.length > 120) return false;
  const lowered = name.toLowerCase();
  const blockedNamePatterns = [
    /\btop\s+\d+/,
    /\bbest\b/,
    /\blargest\b/,
    /\breport a concern\b/,
    /\bprivacy policy\b/,
    /\bcareers\b/,
    /\bcontact us\b/,
    /\babout us\b/,
    /\breviews?\b/,
    /\bcompanies\b/,
    /\bsuppliers\b/,
    /^\[pdf\]/i
  ];
  if (blockedNamePatterns.some((pattern) => pattern.test(lowered))) return false;
  return true;
}

function hardFilterCompanyCandidates(candidates: SimilarCandidate[], blockedDomainsInput: string[] = []): SimilarCandidate[] {
  const blockedDomains = new Set([
    "trustpilot.com",
    "companydata.com",
    "crunchbase.com",
    "owler.com",
    "zoominfo.com",
    "apollo.io",
    "yelp.com",
    "glassdoor.com",
    "f6s.com",
    "lusha.com",
    "ensun.io",
    "kompass.com",
    "wikipedia.org",
    "linkedin.com",
    "clutch.co",
    "sortlist.com",
    "rocketreach.co",
    "rocketreach.com",
    "signalhire.com",
    "contactout.com",
    "theorg.com",
    ...normalizeDomainList(blockedDomainsInput)
  ]);
  const out: SimilarCandidate[] = [];
  const seenNames = new Set<string>();
  const seenDomains = new Set<string>();

  for (const candidate of candidates) {
    if (!looksLikeCompanyName(candidate.name)) continue;
    const domain = websiteDomain(candidate.website || candidate.sourceUrl || "");
    if (domain) {
      if (blockedDomains.has(domain)) continue;
      if (Array.from(blockedDomains).some((blocked) => domain.endsWith(`.${blocked}`))) continue;
      if (pathLooksLikeContentPage(candidate.website || candidate.sourceUrl || "")) continue;
      if (seenDomains.has(domain)) continue;
    }
    const key = normalizeCompanyName(candidate.name);
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);
    if (domain) seenDomains.add(domain);
    out.push(candidate);
  }

  return out;
}

function enforceCountryAndRegistryQuality(
  candidates: SimilarCandidate[],
  country: string | null,
  blockedDomainsInput: string[] = []
): SimilarCandidate[] {
  const blockedDomains = normalizeDomainList(blockedDomainsInput);
  return candidates.filter((candidate) => {
    const domain = websiteDomain(candidate.website || candidate.sourceUrl || "");
    if (!domain) return false;
    if (blockedDomains.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) return false;
    if (!domainMatchesCountry(domain, country)) return false;
    if (pathLooksLikeContentPage(candidate.website || candidate.sourceUrl || "")) return false;
    if (!isLikelyCompanyCandidateName(candidate.name)) return false;
    return true;
  });
}

async function validateCandidatesWithGemini(
  candidates: SimilarCandidate[],
  context: { companyName: string; country: string | null; region: string | null; industry: string | null },
  systemPrompt: string
): Promise<SimilarCandidate[]> {
  if (candidates.length === 0) return candidates;
  const prompt = composePrompt(
    systemPrompt,
    [
      "TASK: Validate candidate list and keep only likely real companies.",
      "Return JSON only:",
      "{ \"keep\": [ { \"name\": \"string\", \"reason\": \"string\", \"confidence\": \"high|medium|low\" } ] }",
      "",
      `Reference company: ${context.companyName}`,
      `Country: ${context.country ?? "-"}`,
      `Region: ${context.region ?? "-"}`,
      `Industry: ${context.industry ?? "-"}`,
      "",
      "Reject non-company pages (reviews, lists, directories, policy/career pages, generic content).",
      "Candidate pool:",
      JSON.stringify(candidates, null, 2)
    ].join("\n")
  );

  try {
    const result = await generateWithGemini(prompt, { jsonMode: true, maxOutputTokens: 4096 });
    if (!result?.outputText) return candidates;
    const parsed = extractJsonObject(result.outputText);
    const keepRows = Array.isArray(parsed?.keep) ? parsed.keep : [];
    if (keepRows.length === 0) return candidates;
    const keepSet = new Set(
      keepRows
        .map((row) => (row && typeof row === "object" ? normalizeCompanyName(String((row as Record<string, unknown>).name ?? "")) : ""))
        .filter(Boolean)
    );
    const filtered = candidates.filter((candidate) => keepSet.has(normalizeCompanyName(candidate.name)));
    return filtered.length > 0 ? filtered : candidates;
  } catch {
    return candidates;
  }
}

async function crmFallbackSimilarCustomers(
  baseCustomer: MinimalCustomer | null,
  companyName: string,
  scope: "country" | "region",
  country: string | null,
  region: string | null,
  industry: string | null,
  seller: string | null,
  potentialScore: number,
  segmentFocus: SegmentFocus,
  maxSimilar: number
): Promise<SimilarCandidate[]> {
  const pool = await prisma.customer.findMany({
    where: {
      ...(baseCustomer ? { id: { not: baseCustomer.id } } : {}),
      ...(scope === "country" && country ? { country } : {}),
      ...(scope === "region" && region ? { region } : {})
    },
    select: {
      id: true,
      name: true,
      registrationNumber: true,
      naceCode: true,
      country: true,
      region: true,
      industry: true,
      seller: true,
      notes: true,
      potentialScore: true,
      website: true
    },
    take: 300
  });

  const segmentFiltered = pool.filter((candidate) => {
    const candidateSegment = inferSegmentFocus(
      [candidate.name, candidate.registrationNumber, candidate.industry, candidate.seller, candidate.notes].filter(Boolean).join(" ")
    );
    return segmentMatches(segmentFocus, candidateSegment);
  });
  const rankingPool = segmentFiltered.length >= 3 ? segmentFiltered : pool;

  const ranked = rankSimilarCustomers(
    {
      id: baseCustomer?.id ?? "external-target",
      name: companyName,
      country,
      region,
      industry,
      seller,
      potentialScore
    },
    rankingPool
  ).slice(0, maxSimilar);

  return ranked.map((row) => ({
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    industry: row.industry,
    seller: row.seller,
    potentialScore: row.potentialScore,
    matchScore: row.matchScore,
    website: (rankingPool.find((item) => item.id === row.id)?.website as string | undefined) ?? null,
    reason: "CRM fallback based on similar profile and segment.",
    sourceType: "crm-fallback",
    sourceUrl: null,
    confidence: "medium"
  }));
}

function extractCandidatesFromText(
  text: string,
  maxSimilar: number
): Array<{
  id: string;
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
}> {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));

  const seen = new Set<string>();
  const out: Array<{
    id: string;
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
  }> = [];

  for (const raw of lines) {
    const cleaned = raw
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\s+\(already customer\)$/i, "")
      .trim();
    const name = cleaned.split(/[|–—-]/)[0]?.trim() ?? "";
    if (!name || name.length < 3) continue;
    const key = normalizeCompanyName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `external-text-${out.length + 1}`,
      name,
      country: null,
      region: null,
      industry: null,
      seller: null,
      potentialScore: 50,
      matchScore: 50,
      reason: "Extracted from non-JSON AI output",
      sourceType: "estimated",
      sourceUrl: null,
      confidence: "low"
    });
    if (out.length >= maxSimilar) break;
  }

  return out;
}

function extractCandidatesFromMarkdownTable(text: string, maxSimilar: number): SimilarCandidate[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const tableLines = lines.filter((line) => line.includes("|"));
  if (tableLines.length < 3) return [];

  const out: SimilarCandidate[] = [];
  const seen = new Set<string>();

  for (const line of tableLines) {
    if (/^\|?\s*-{2,}/.test(line)) continue;
    const cols = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cols.length < 2) continue;
    const companyCell = cols[0] ?? "";
    const lower = companyCell.toLowerCase();
    if (!companyCell || lower.includes("company") || lower.includes("företag") || lower.includes("name")) continue;
    if (!looksLikeCompanyName(companyCell)) continue;

    const key = normalizeCompanyName(companyCell);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const regionCell = cols[1] ?? "";
    const websiteCell = cols.find((cell) => /https?:\/\//i.test(cell)) ?? null;
    const website = websiteCell ? websiteCell.match(/https?:\/\/\S+/i)?.[0] ?? null : null;

    out.push({
      id: `external-table-${out.length + 1}`,
      name: companyCell,
      country: null,
      region: regionCell || null,
      industry: null,
      seller: null,
      potentialScore: 50,
      matchScore: 50,
      website,
      reason: "Extracted from AI markdown table",
      sourceType: "llm-chat",
      sourceUrl: website,
      confidence: "low"
    });
    if (out.length >= maxSimilar) break;
  }

  return out;
}

function composePrompt(systemPrompt: string, taskPrompt: string): string {
  const system = String(systemPrompt ?? "").trim();
  const task = String(taskPrompt ?? "").trim();
  if (!system) return task;
  if (!task) return system;
  return `${system}\n\n${task}`;
}

function buildTaskPrompt(taskPrompt: string, inputPayload: Record<string, unknown>): string {
  const task = String(taskPrompt ?? "").trim();
  const inputJson = JSON.stringify(inputPayload, null, 2);
  if (!task) return `INPUT JSON\n${inputJson}`;
  return `${task}\n\nINPUT JSON\n${inputJson}`;
}

function buildClaudeUserPrompt(
  templatePrompt: string | null | undefined,
  taskPrompt: string,
  inputPayload: Record<string, unknown>
): string {
  const template = String(templatePrompt ?? "").trim();
  const fallback = buildTaskPrompt(taskPrompt, inputPayload);
  if (!template) return fallback;

  const inputJson = JSON.stringify(inputPayload, null, 2);
  let out = template;

  if (out.includes("{{TASK_PROMPT}}")) {
    out = out.replaceAll("{{TASK_PROMPT}}", taskPrompt);
  }
  if (out.includes("{{INPUT_JSON}}")) {
    out = out.replaceAll("{{INPUT_JSON}}", inputJson);
  }

  if (out === template) {
    // No placeholders at all – append both task and input
    out = `${template}\n\n${taskPrompt}\n\nINPUT JSON\n${inputJson}`;
  } else if (!template.includes("{{TASK_PROMPT}}")) {
    // INPUT_JSON was replaced but task prompt (with JSON shape spec) was not in template –
    // prepend it so the model always receives the output schema instruction
    out = `${taskPrompt}\n\n${out}`;
  }

  return out;
}

function toDomain(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeSearchUrl(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return `${url.protocol}//${url.hostname}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function normalizeDomainList(list: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      list
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .map((value) => toDomain(value))
        .filter(Boolean)
    )
  );
}

function isBlockedDomain(url: string | null | undefined, blockedDomains: string[]): boolean {
  const host = toDomain(url);
  if (!host) return false;
  return blockedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isLikelyCompanyCandidateName(value: string): boolean {
  const name = String(value ?? "").trim();
  if (!name) return false;
  if (name.length > 120) return false;
  const lowered = name.toLowerCase();
  const banned = [
    "privacy policy",
    "careers",
    "jobs",
    "terms",
    "cookie",
    "report a concern",
    "annual report",
    "what does your",
    "top ",
    "list of ",
    "reviews of ",
    "[pdf]"
  ];
  if (banned.some((token) => lowered.includes(token))) return false;
  return /[a-zåäö]/i.test(name);
}

const CONTACT_ROLE_PATTERNS: Array<{ role: string; pattern: RegExp }> = [
  { role: "Purchasing Manager", pattern: /\b(inköpschef|inkopschef|purchasing manager|head of purchasing|procurement manager)\b/i },
  { role: "Category Manager", pattern: /\b(kategorichef|category manager|sortimentsansvarig|assortment manager)\b/i },
  { role: "Head of E-commerce", pattern: /\b(e-handelschef|head of e-?commerce|ecommerce manager|online manager)\b/i },
  { role: "CEO / Managing Director", pattern: /\b(vd|ceo|managing director|chief executive)\b/i },
  { role: "Procurement", pattern: /\b(procurement|sourcing|inköp|inkop)\b/i }
];

function inferContactRole(text: string): string | null {
  const input = String(text ?? "");
  for (const row of CONTACT_ROLE_PATTERNS) {
    if (row.pattern.test(input)) return row.role;
  }
  return null;
}

function extractLikelyPersonName(text: string, companyName: string): string | null {
  const source = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!source) return null;
  const companyNeedle = normalizeCompanyName(companyName);
  const candidates = source
    .split(/[\-|–|•|·|\||,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  for (const candidate of candidates) {
    const normalized = normalizeCompanyName(candidate);
    if (!normalized || normalized.includes(companyNeedle) || companyNeedle.includes(normalized)) continue;
    if (/\b(linkedin|contact|about|profile|team|company|jobb|job|careers?)\b/i.test(candidate)) continue;
    const match = candidate.match(/\b([A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö]+){1,2})\b/);
    if (!match?.[1]) continue;
    const name = match[1].trim();
    if (name.split(" ").length < 2) continue;
    return name;
  }
  return null;
}

function isTrustedContactDomain(url: string): boolean {
  const domain = toDomain(url);
  if (!domain) return false;
  const trusted = [
    "linkedin.com",
    "allabolag.se",
    "bolagsverket.se",
    "proff.se",
    "proff.no",
    "proff.dk",
    "virk.dk"
  ];
  return trusted.some((item) => domain === item || domain.endsWith(`.${item}`));
}

async function discoverCompanyContacts(input: {
  companyName: string;
  country?: string | null;
  organizationNumber?: string | null;
  website?: string | null;
  maxResults?: number;
}): Promise<ContactSignal[]> {
  const maxResults = Math.min(20, Math.max(6, input.maxResults ?? 12));
  const countryToken = String(input.country ?? "").trim();
  const orgToken = String(input.organizationNumber ?? "").trim();
  const websiteDomain = toDomain(input.website);
  const queries = [
    `"${input.companyName}" inköpschef linkedin`,
    `"${input.companyName}" category manager linkedin`,
    `"${input.companyName}" e-commerce manager linkedin`,
    `"${input.companyName}" ceo linkedin`,
    `"${input.companyName}" ${countryToken} ${orgToken} board allabolag proff`
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);

  const all = (
    await Promise.all(
      queries.map(async (query) => {
        const [serper, tavily] = await Promise.all([
          fetchSerperCompanySignals(query, maxResults),
          fetchTavilyCompanySignals(query, maxResults)
        ]);
        return [...serper, ...tavily];
      })
    )
  ).flat();

  const seen = new Set<string>();
  const out: ContactSignal[] = [];
  for (const row of all) {
    const sourceUrl = normalizeSearchUrl(row.url);
    if (!sourceUrl) continue;
    const role = inferContactRole(`${row.title} ${row.snippet}`);
    if (!role) continue;
    const name = extractLikelyPersonName(`${row.title} ${row.snippet}`, input.companyName);
    if (!name) continue;

    const urlDomain = toDomain(sourceUrl);
    const directCompanyHint = Boolean(websiteDomain && urlDomain === websiteDomain);
    const trustedDomain = isTrustedContactDomain(sourceUrl);
    const confidence: ContactSignal["confidence"] = trustedDomain || directCompanyHint ? "High" : "Medium";
    const verificationStatus: ContactSignal["verificationStatus"] =
      trustedDomain || directCompanyHint ? "Verified" : "NeedsValidation";

    const key = `${normalizeCompanyName(name)}:${normalizeCompanyName(role)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      name,
      role,
      sourceUrl,
      sourceType: row.sourceType,
      snippet: row.snippet,
      confidence,
      verificationStatus
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

async function fetchSerperCompanySignals(query: string, maxResults: number): Promise<CompanySignal[]> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return [];

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey
    },
    body: JSON.stringify({
      q: query,
      num: Math.min(10, Math.max(4, maxResults))
    }),
    cache: "no-store"
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    organic?: Array<{
      title?: string;
      link?: string;
      snippet?: string;
    }>;
  };

  return (Array.isArray(data.organic) ? data.organic : [])
    .map((row): CompanySignal | null => {
      const url = normalizeSearchUrl(String(row.link ?? ""));
      if (!url) return null;
      return {
        title: String(row.title ?? "").trim(),
        url,
        snippet: String(row.snippet ?? "").trim().slice(0, 400),
        sourceType: "serper"
      };
    })
    .filter((row): row is CompanySignal => Boolean(row));
}

async function fetchTavilyCompanySignals(query: string, maxResults: number): Promise<CompanySignal[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: Math.min(8, Math.max(4, maxResults)),
      search_depth: "advanced"
    }),
    cache: "no-store"
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (Array.isArray(data.results) ? data.results : [])
    .map((row): CompanySignal | null => {
      const url = normalizeSearchUrl(String(row.url ?? ""));
      if (!url) return null;
      return {
        title: String(row.title ?? "").trim(),
        url,
        snippet: String(row.content ?? "").trim().slice(0, 400),
        sourceType: "tavily"
      };
    })
    .filter((row): row is CompanySignal => Boolean(row));
}

async function discoverCompanySignals(input: {
  companyName: string;
  country?: string | null;
  region?: string | null;
  organizationNumber?: string | null;
  website?: string | null;
  industry?: string | null;
  maxResults?: number;
  blockedDomains?: string[];
  preferredDomains?: string[];
}): Promise<CompanySignal[]> {
  const maxResults = Math.min(20, Math.max(8, input.maxResults ?? 12));
  const countryToken = (input.country || "").trim();
  const regionToken = (input.region || "").trim();
  const orgToken = (input.organizationNumber || "").trim();
  const industryToken = (input.industry || "").trim();
  const websiteDomain = toDomain(input.website);
  const blockedDomains = normalizeDomainList(input.blockedDomains ?? []);
  const preferredDomains = normalizeDomainList(input.preferredDomains ?? []);

  const queries = [
    `"${input.companyName}" ${countryToken} ${regionToken} official website`,
    `"${input.companyName}" ${countryToken} ${regionToken} omzet turnover revenue employees`,
    `"${input.companyName}" ${countryToken} ${orgToken} bolagsverket allabolag proff`,
    `"${input.companyName}" ${countryToken} ${industryToken} e-commerce retailer`
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 4);

  const all = (
    await Promise.all(
      queries.map(async (query) => {
        const [serper, tavily] = await Promise.all([
          fetchSerperCompanySignals(query, maxResults),
          fetchTavilyCompanySignals(query, maxResults)
        ]);
        return [...serper, ...tavily];
      })
    )
  ).flat();

  const seen = new Set<string>();
  const filtered: CompanySignal[] = [];
  const companyNameNeedle = normalizeCompanyName(input.companyName);

  for (const signal of all) {
    const normalizedUrl = normalizeSearchUrl(signal.url);
    if (!normalizedUrl) continue;
    if (isBlockedDomain(normalizedUrl, blockedDomains)) continue;
    const key = `${signal.sourceType}:${normalizedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const text = `${signal.title} ${signal.snippet}`.toLowerCase();
    const urlDomain = toDomain(normalizedUrl);
    const companyMatch =
      normalizeCompanyName(signal.title).includes(companyNameNeedle) ||
      normalizeCompanyName(signal.snippet).includes(companyNameNeedle) ||
      (websiteDomain && urlDomain === websiteDomain);

    const strongBusinessSignal =
      /\b(ab|as|a\/s|oy|aps|oü|gmbh|ltd|inc)\b/i.test(text) ||
      /\b(revenue|employees|omsättning|turnover|org\.?|organisation|about|om oss)\b/i.test(text);

    if (!companyMatch && !strongBusinessSignal) continue;

    filtered.push({
      ...signal,
      url: normalizedUrl
    });
    if (filtered.length >= maxResults) break;
  }
  if (preferredDomains.length === 0) return filtered;
  return filtered.sort((a, b) => {
    const aPreferred = preferredDomains.some((domain) => {
      const host = toDomain(a.url);
      return host === domain || host.endsWith(`.${domain}`);
    });
    const bPreferred = preferredDomains.some((domain) => {
      const host = toDomain(b.url);
      return host === domain || host.endsWith(`.${domain}`);
    });
    if (aPreferred === bPreferred) return 0;
    return aPreferred ? -1 : 1;
  });
}

function toScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSimilarCandidate(row: unknown, index: number): SimilarCandidate | null {
  const item = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const name = String(item.name ?? item.company ?? "").trim();
  if (!name) return null;

  const fitScore = toScore(item.fitScore ?? item.fit_score ?? null, Number.NaN);
  const potentialScoreRaw = toScore(item.potentialScore ?? item.potential_score ?? null, Number.NaN);
  const totalScore = toScore(item.totalScore ?? item.total_score ?? null, Number.NaN);

  return {
    id: `external-${index + 1}`,
    name,
    country: item.country ? String(item.country) : null,
    region: item.region ? String(item.region) : null,
    industry: item.industry ? String(item.industry) : null,
    seller: null,
    potentialScore: Number.isFinite(potentialScoreRaw)
      ? potentialScoreRaw
      : toScore(item.potential ?? 50, 50),
    matchScore: toScore(item.matchScore ?? item.match_score ?? item.match ?? item.score ?? 50, 50),
    website: item.website ? String(item.website) : item.url ? String(item.url) : null,
    organizationNumber:
      item.organizationNumber
        ? String(item.organizationNumber)
        : item.orgNumber
        ? String(item.orgNumber)
        : item.org_no
        ? String(item.org_no)
        : null,
    reason:
      item.reason
        ? String(item.reason)
        : item.why_similar
        ? String(item.why_similar)
        : item.why_relevant_for_vendora
        ? String(item.why_relevant_for_vendora)
        : item.rationale
        ? String(item.rationale)
        : null,
    sourceType: item.sourceType ? String(item.sourceType) : item.source_type ? String(item.source_type) : null,
    sourceUrl: item.sourceUrl ? String(item.sourceUrl) : item.source ? String(item.source) : null,
    confidence: item.confidence ? String(item.confidence) : null,
    fitScore: Number.isFinite(fitScore) ? fitScore : null,
    potentialScoreRaw: Number.isFinite(potentialScoreRaw) ? potentialScoreRaw : null,
    totalScore: Number.isFinite(totalScore) ? totalScore : null,
    similarityScore: toScore(item.similarityScore ?? item.similarity_score ?? null, Number.NaN)
  };
}

function extractSimilarCandidates(payload: unknown, maxSimilar: number): SimilarCandidate[] {
  const parsedObj =
    payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;

  const groups =
    parsedObj?.candidate_groups && typeof parsedObj.candidate_groups === "object" && !Array.isArray(parsedObj.candidate_groups)
      ? (parsedObj.candidate_groups as Record<string, unknown>)
      : null;

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(parsedObj?.candidates)
    ? parsedObj.candidates
    : Array.isArray(parsedObj?.similarCustomers)
    ? parsedObj.similarCustomers
    : Array.isArray(parsedObj?.similar_customers)
    ? parsedObj.similar_customers
    : Array.isArray(parsedObj?.results)
    ? parsedObj.results
    : Array.isArray(parsedObj?.recommended_targets)
    ? parsedObj.recommended_targets
    : groups && Array.isArray(groups.closest_overall_match)
    ? groups.closest_overall_match
    : [];

  return rows
    .map((row, index) => normalizeSimilarCandidate(row, index))
    .filter((item): item is SimilarCandidate => Boolean(item))
    .slice(0, maxSimilar);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const cookieHeader = req.headers.get("cookie") || "";
    const token = readSessionToken(cookieHeader);
    const session = token ? await verifySession(token) : null;
    const actorEmail = session?.email || null;
    const settings = await getResearchConfig();
    const scope = body.scope === "country" ? "country" : body.scope === "region" ? "region" : settings.defaultScope;
    const maxSimilar = Math.max(1, Math.min(500, body.maxSimilar ?? 10));
    const profileMaxTokensRaw = Number(process.env.GEMINI_PROFILE_MAX_OUTPUT_TOKENS);
    const profileMaxTokens =
      Number.isFinite(profileMaxTokensRaw) && profileMaxTokensRaw > 0
        ? Math.max(4096, Math.min(32768, Math.round(profileMaxTokensRaw)))
        : 24576;

    let baseCustomer = null as null | MinimalCustomer;

    if (body.customerId) {
      baseCustomer = await prisma.customer.findUnique({
        where: { id: body.customerId },
        select: {
          id: true,
          name: true,
          registrationNumber: true,
          naceCode: true,
          country: true,
          region: true,
          industry: true,
          seller: true,
          website: true,
          notes: true,
          potentialScore: true,
          webshopSignals: true
        }
      });

      if (!baseCustomer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }
    }

    const companyName = body.companyName ?? baseCustomer?.name;

    if (!companyName) {
      return NextResponse.json({ error: "companyName or customerId is required" }, { status: 400 });
    }

    const country = body.country ?? baseCustomer?.country ?? null;
    const region = body.region ?? baseCustomer?.region ?? null;
    const seller = body.seller ?? baseCustomer?.seller ?? null;
    const industry = body.industry ?? baseCustomer?.industry ?? null;
    const potentialScore = baseCustomer?.potentialScore ?? 50;
    const segmentFocus: SegmentFocus =
      body.segmentFocus ??
      inferSegmentFocus(
        [
          baseCustomer?.name,
          baseCustomer?.registrationNumber,
          baseCustomer?.industry,
          baseCustomer?.seller,
          baseCustomer?.notes,
          companyName
        ]
          .filter(Boolean)
          .join(" ")
      );

    const vendorCatalogWebsites = uniqueNormalizedUrls([
      VENDORA_RESELLER_URL,
      ...settings.vendorWebsites,
      ...settings.brandWebsites
    ], 20);

    const customerWebsiteSet = new Set<string>();
    const vendoraWebsiteSet = new Set<string>();
    const manualWebsiteSet = new Set<string>();
    const urlSet = new Set<string>();
    if (baseCustomer?.website) {
      const normalized = normalizeUrl(baseCustomer.website);
      urlSet.add(normalized);
      customerWebsiteSet.add(normalized);
    }
    if (!body.externalOnly || body.externalMode === "profile") {
      for (const website of vendorCatalogWebsites) {
        urlSet.add(website);
        vendoraWebsiteSet.add(website);
      }
    }
    for (const website of body.websites ?? []) {
      if (website?.trim()) {
        const normalized = normalizeUrl(website);
        urlSet.add(normalized);
        manualWebsiteSet.add(normalized);
      }
    }

    const websites = Array.from(urlSet).slice(0, 14);

    const websiteSnapshots = (
      await Promise.all(
        websites.map(async (website) => {
          try {
            return await fetchWebsiteSnapshot(website);
          } catch {
            return null;
          }
        })
      )
    ).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const websiteAttribution: WebsiteSourceAttribution[] = websiteSnapshots.map((snapshot) => {
      const origins: string[] = [];
      if (customerWebsiteSet.has(snapshot.url)) origins.push("customer_website");
      if (vendoraWebsiteSet.has(snapshot.url)) origins.push("vendora_catalog");
      if (manualWebsiteSet.has(snapshot.url)) origins.push("manual_input");
      if (origins.length === 0) origins.push("inferred");
      return {
        url: snapshot.url,
        title: snapshot.title,
        origins
      };
    });
    const customerWebsiteSnapshots = websiteSnapshots.filter((snapshot) => !isVendoraWebsite(snapshot.url));
    const vendoraWebsiteSnapshots = websiteSnapshots.filter((snapshot) => isVendoraWebsite(snapshot.url));
    const compactWebsiteSnapshots = compactWebsiteSnapshotsForPrompt(websiteSnapshots);

    let similarCustomers: SimilarCandidate[] = [];

    if (body.externalOnly) {
      if (body.externalMode === "profile") {
        const companySignals = await discoverCompanySignals({
          companyName,
          country,
          region,
          organizationNumber: baseCustomer?.registrationNumber ?? null,
          website: baseCustomer?.website ?? null,
          industry,
          maxResults: 28,
          blockedDomains: settings.blockedSourceDomains,
          preferredDomains: settings.preferredSourceDomains
        });
        const discoveredContacts = await discoverCompanyContacts({
          companyName,
          country,
          organizationNumber: baseCustomer?.registrationNumber ?? null,
          website: baseCustomer?.website ?? null,
          maxResults: 16
        });
        const customerResearchContext = baseCustomer?.id ? await loadCustomerResearchContext(baseCustomer.id) : null;
        const mergedExtraInstructions = [settings.extraInstructions, body.extraInstructions]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
        const taskBasePrompt =
          body.basePrompt?.trim() || settings.fullResearchPrompt;
        const deepProfileGuard = [
          "OUTPUT DEPTH REQUIREMENTS (MANDATORY):",
          "- Return ONLY valid JSON.",
          "- No markdown, no code-fences, no prose outside JSON.",
          "- Include concrete numbers for FitScore, PotentialScore, TotalScore and Year-1 potential (Low/Base/High).",
          "- Include at least 5 score drivers and at least 5 explicit assumptions.",
          "- Include at least 8 category recommendations and at least 8 next actions.",
          "- Include role-based contact paths if named buyers are unavailable.",
          "- Include estimated revenue/size signals with confidence and source notes.",
          "- Include at least 8 detailed next actions.",
          "- Do not stop after account header fields.",
          "- Be specific for the selected account, not generic.",
          "- Always include the company registration number (org.nr), NACE/SNI industry code (e.g. 47.41 for computer retail), official website URL, headquarters city, countries of operation, revenue, employees, ownership, founded year, logistics model, and brand mix signals in account_summary. Use public registry data when available. For Nordic countries: use SNI (SE), SN (NO), DB (DK), TOL (FI), or NACE (EU) codes.",
          "- CRITICAL SCORING RULE: If crm_customer_context contains salesRecords with historical purchase data (netSales, grossMargin, unitsSold), this is VERIFIED internal sales history and MUST heavily influence scoring. A customer with proven purchase history should score significantly higher on PotentialScore (execution likelihood is proven) and FitScore (assortment overlap is demonstrated). Historical netSales is the strongest evidence of future potential. Weight internal CRM data higher than public web signals."
        ].join("\n");
        const deepProfileJsonShape = [
          "RETURN THIS EXACT JSON SHAPE:",
          "{",
          '  "account_summary": {',
          '    "registration_number": "",',
          '    "nace_code": "",',
          '    "legal_name": "",',
          '    "website": "",',
          '    "headquarters": "",',
          '    "countries_of_operation": [],',
          '    "revenue": { "value": "", "year": "", "status": "Verified|Estimated", "source": "" },',
          '    "employees": { "value": "", "year": "", "status": "Verified|Estimated", "source": "" },',
          '    "ownership": { "value": "", "year": "", "status": "Verified|Estimated", "source": "" },',
          '    "founded": { "value": "", "year": "", "status": "Verified|Estimated", "source": "" },',
          '    "logistics_model": "",',
          '    "brand_mix_signals": [],',
          '    "summary": "",',
          '    "segment_channel_profile": [],',
          '    "commercial_relevance_for_vendora": "",',
          '    "verification_status": "Verified|Estimated|NeedsValidation",',
          '    "confidence": "High|Medium|Low"',
          "  },",
          '  "vendora_fit_scorecard": {',
          '    "fit_score": 0,',
          '    "assortment_fit_score": 0,',
          '    "potential_score": 0,',
          '    "total_score": 0,',
          '    "year_1_purchase_potential": { "low": "", "base": "", "high": "", "currency": "SEK" },',
          '    "score_drivers": [],',
          '    "assumptions": [],',
          '    "confidence": "High|Medium|Low"',
          "  },",
          '  "recommended_categories_to_pitch": [',
          '    { "category_or_brand": "", "why_it_fits": "", "opportunity_level": "High|Medium|Low" }',
          "  ],",
          '  "contact_paths": {',
          '    "named_contacts": [',
          '      { "name": "", "role": "", "source_note": "", "confidence": "High|Medium|Low" }',
          "    ],",
          '    "role_based_paths": [',
          '      { "function": "", "likely_entry_path": "", "confidence": "High|Medium|Low" }',
          "    ],",
          '    "fallback_path": ""',
          "  },",
          '  "next_best_actions": [""]',
          "}"
        ].join("\n");
        const profilePayload = {
          target_account: {
            name: companyName,
            registration_number: baseCustomer?.registrationNumber ?? null,
            nace_code: baseCustomer?.naceCode ?? null,
            country,
            region,
            industry,
            segment_focus: segmentFocus,
            seller_owner: seller,
            legacy_potential_score: potentialScore
          },
          vendora: {
            countries_served: settings.countries,
            positioning: "Vendora Nordic channel distributor",
            assortment_catalog: vendorCatalogWebsites,
            strategic_focus: settings.industries,
            constraints: [],
            onboarding_link: vendorCatalogWebsites[0] ?? null
          },
          research_inputs: {
            website_data: compactWebsiteSnapshots,
            customer_profile_enrichment: asObject(baseCustomer?.webshopSignals)?.research ?? null,
            manual_brand_revenue: customerResearchContext?.manualBrandRevenue ?? [],
            crm_customer_context: customerResearchContext,
            public_company_data: {
              signals: companySignals
            },
            category_signals: [industry].filter(Boolean),
            brand_signals: [],
            size_signals: companySignals
              .map((signal) => signal.snippet)
              .filter((snippet) => /(revenue|omsättning|employees|anställda|turnover|stores)/i.test(snippet)),
            contact_signals: {
              verified_named_contacts: discoveredContacts,
              role_signal_snippets: companySignals
                .map((signal) => signal.snippet)
                .filter((snippet) => /(buyer|procurement|category manager|inköp|inkop|business sales|e-commerce manager|ceo|vd)/i.test(snippet))
            },
            internal_notes: [baseCustomer?.notes].filter(Boolean)
          },
          filters: {
            scope,
            exclude_distributors: true,
            allowed_sources: Array.from(
              new Set([...registryHintsForCountry(country), ...settings.registrySourceUrls, ...settings.preferredSourceDomains])
            ).slice(0, 40)
          },
          additional_instructions: mergedExtraInstructions || null
        };
        const taskPromptBase = `${taskBasePrompt}\n\n${deepProfileGuard}\n\n${deepProfileJsonShape}`;
        const taskPrompt = buildTaskPrompt(taskPromptBase, profilePayload);
        const finalPrompt = composePrompt(settings.globalSystemPrompt, taskPrompt);
        const claudeSystemPrompt = settings.claudeCachingSystemPrompt || settings.globalSystemPrompt;

        let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
        let aiError: string | null = null;
        try {
          aiResult = await generateWithGemini(finalPrompt, {
            jsonMode: true,
            maxOutputTokens: profileMaxTokens,
            systemPrompt: claudeSystemPrompt,
            userPrompt: buildClaudeUserPrompt(settings.claudeCachingUserPrompt, taskPromptBase, profilePayload),
            usePromptCaching: true,
            cacheTtl: settings.claudeCachingTtl
          });
        } catch (error) {
          aiError = error instanceof Error ? error.message : "Gemini request failed";
        }
        if (!aiResult && !aiError) {
          aiError = "Gemini unavailable: missing GEMINI_API_KEY or model access.";
        }

        const firstStructured = aiResult?.outputText ? parseStructuredResearchInsight(aiResult.outputText) : null;
        const firstShapeValid = aiResult?.outputText ? hasRequiredDeepProfileShape(aiResult.outputText) : false;
        const truncatedByModel =
          String(aiResult?.finishReason ?? "")
            .toUpperCase()
            .includes("MAX_TOKENS");
        const outputTooShort =
          truncatedByModel ||
          (aiResult?.outputText?.trim().length ?? 0) < 1200 ||
          !firstShapeValid ||
          !firstStructured ||
          (firstStructured.categoriesToPitch?.length ?? 0) < 5 ||
          (firstStructured.nextBestActions?.length ?? 0) < 6;
        if (!aiError && outputTooShort) {
          const retryTaskPrompt = `${taskBasePrompt}\n\n${deepProfileGuard}\n\n${deepProfileJsonShape}\n\nCRITICAL RETRY INSTRUCTION: The previous answer was too short or not parseable. Return only complete JSON shape with deeper commercial detail, quantified ranges, and concrete account-specific recommendations.`;
          const retryPrompt = composePrompt(settings.globalSystemPrompt, buildTaskPrompt(retryTaskPrompt, profilePayload));
          try {
            const retryResult = await generateWithGemini(retryPrompt, {
              jsonMode: true,
              maxOutputTokens: profileMaxTokens,
              systemPrompt: claudeSystemPrompt,
              userPrompt: buildClaudeUserPrompt(settings.claudeCachingUserPrompt, retryTaskPrompt, profilePayload),
              usePromptCaching: true,
              cacheTtl: settings.claudeCachingTtl
            });
            if ((retryResult?.outputText?.trim().length ?? 0) > (aiResult?.outputText?.trim().length ?? 0)) {
              aiResult = retryResult;
            }
          } catch {
            // Keep original result if retry fails.
          }
        }

        let structuredInsight = aiResult?.outputText ? parseStructuredResearchInsight(aiResult.outputText) : null;
        const parsedShapeOk = aiResult?.outputText ? hasRequiredDeepProfileShape(aiResult.outputText) : false;
        const needsHardFallback =
          !aiError &&
          aiResult?.outputText &&
          (!parsedShapeOk ||
            !structuredInsight ||
            (structuredInsight.categoriesToPitch?.length ?? 0) < 4 ||
            (structuredInsight.nextBestActions?.length ?? 0) < 5);
        if (needsHardFallback) {
          const hardFallbackTaskPrompt = [
            "TASK: Deep commercial account research for one selected customer account.",
            "Return ONLY valid JSON using the exact required JSON shape.",
            "No markdown. No prose outside JSON.",
            "Must include:",
            "- fit_score, assortment_fit_score, potential_score, total_score",
            "- year_1_purchase_potential low/base/high",
            "- at least 8 recommended categories to pitch",
            "- at least 8 next_best_actions",
            "- score_drivers and assumptions with confidence."
          ].join("\n");
          const hardFallbackPrompt = composePrompt(
            settings.globalSystemPrompt,
            buildTaskPrompt(hardFallbackTaskPrompt, profilePayload)
          );
          try {
            const hardFallbackResult = await generateWithGemini(hardFallbackPrompt, {
              jsonMode: true,
              maxOutputTokens: profileMaxTokens,
              systemPrompt: claudeSystemPrompt,
              userPrompt: buildClaudeUserPrompt(settings.claudeCachingUserPrompt, hardFallbackTaskPrompt, profilePayload),
              usePromptCaching: true,
              cacheTtl: settings.claudeCachingTtl
            });
            const hardFallbackInsight = hardFallbackResult?.outputText
              ? parseStructuredResearchInsight(hardFallbackResult.outputText)
              : null;
            if (hardFallbackInsight) {
              aiResult = hardFallbackResult;
              structuredInsight = hardFallbackInsight;
            }
          } catch {
            // Keep previous result if fallback call fails.
          }
        }

        if (!aiError && !structuredInsight) {
          const compactPayload = {
            ...profilePayload,
            research_inputs: {
              ...profilePayload.research_inputs,
              website_data: compactWebsiteSnapshotsForRetry(websiteSnapshots)
            }
          };
          const compactRetryTaskPrompt = [
            "TASK: Deep commercial account research for one selected customer account.",
            "Return ONLY valid JSON in the required shape.",
            "No markdown. No code fences. No prose outside JSON.",
            "Keep text concise but complete for all required fields.",
            "Prioritize parseable, complete JSON over verbosity."
          ].join("\n");
          const compactRetryPrompt = composePrompt(
            settings.globalSystemPrompt,
            buildTaskPrompt(compactRetryTaskPrompt, compactPayload)
          );
          try {
            const compactResult = await generateWithGemini(compactRetryPrompt, {
              jsonMode: true,
              maxOutputTokens: profileMaxTokens,
              systemPrompt: claudeSystemPrompt,
              userPrompt: buildClaudeUserPrompt(
                settings.claudeCachingUserPrompt,
                compactRetryTaskPrompt,
                compactPayload
              ),
              usePromptCaching: true,
              cacheTtl: settings.claudeCachingTtl
            });
            const compactInsight = compactResult?.outputText
              ? parseStructuredResearchInsight(compactResult.outputText)
              : null;
            if (compactInsight) {
              aiResult = compactResult;
              structuredInsight = compactInsight;
            }
          } catch {
            // Keep previous result if compact retry fails.
          }
        }
        const localAssortmentFitScore = computeAssortmentFitScoreFromSnapshots(
          customerWebsiteSnapshots,
          vendoraWebsiteSnapshots
        );
        const structuredWithFallback =
          structuredInsight && structuredInsight.assortmentFitScore === null && localAssortmentFitScore !== null
            ? { ...structuredInsight, assortmentFitScore: localAssortmentFitScore }
            : structuredInsight;
        const profileSourceAttribution: ResearchSourceAttribution = {
          web: websiteAttribution,
          externalSignals: companySignals.map((signal) => ({
            sourceType: signal.sourceType,
            url: signal.url,
            title: signal.title
          })),
          contacts: discoveredContacts.map((contact) => ({
            name: contact.name,
            role: contact.role,
            sourceUrl: contact.sourceUrl,
            sourceType: contact.sourceType,
            confidence: contact.confidence,
            verificationStatus: contact.verificationStatus
          })),
          crm: customerResearchContext
            ? {
                contactsCount: customerResearchContext.contacts.length,
                plansCount: customerResearchContext.plans.length,
                activitiesCount: customerResearchContext.activities.length,
                salesRecordsCount: customerResearchContext.salesRecords.length,
                manualBrandRevenueCount: customerResearchContext.manualBrandRevenue.length,
                hasPriorResearch: Boolean(customerResearchContext.priorResearch),
                customerUpdatedAt: customerResearchContext.customer?.updatedAt ?? null
              }
            : null
        };
        let savedInsight = null;
        if (baseCustomer?.id && structuredWithFallback) {
          savedInsight = await saveResearchInsightToCustomer(
            baseCustomer.id,
            structuredWithFallback,
            aiResult?.model ?? null,
            actorEmail,
            aiResult?.outputText ?? null,
            profileSourceAttribution
          );
        }

        return NextResponse.json({
          query: {
            customerId: baseCustomer?.id ?? null,
            companyName,
            scope,
            country,
            region,
            seller,
            industry,
            segmentFocus,
            externalOnly: true,
            externalMode: "profile"
          },
          websiteSnapshots,
          companySignals,
          companyContactSignals: discoveredContacts,
          similarCustomers: [],
          structuredInsight: structuredWithFallback,
          localAssortmentFitScore,
          savedInsight,
          usedExtraInstructions: mergedExtraInstructions || null,
          sourceAttribution: profileSourceAttribution,
          aiPrompt: finalPrompt,
          aiResult,
          aiError
        });
      }

      const quickSimilarBaseInstructions = "Keep the response focused. Prioritize similar segment, geography and category profile.";
      const mergedExtraInstructions = [quickSimilarBaseInstructions, settings.extraInstructions, body.extraInstructions]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
      const existingCustomersContext = await loadExistingCustomerRefs();
      const registryHints = Array.from(
        new Set([...registryHintsForCountry(country), ...settings.registrySourceUrls, ...settings.preferredSourceDomains])
      ).slice(0, 40);
      const sniGroups = likelySniGroupFromIndustry(industry);
      const taskBasePrompt = body.basePrompt?.trim() || settings.similarCustomersPrompt;
      const claudeSystemPrompt = settings.claudeCachingSystemPrompt || settings.globalSystemPrompt;
      const similarResponseGuard =
        [
          "RESPONSE REQUIREMENTS (MANDATORY):",
          "- Return valid JSON only.",
          `- Include up to ${maxSimilar} candidates when possible (minimum 25 if data allows).`,
          "- Exclude directory/listing pages and profile databases.",
          "- Prefer official company websites and real retailers/resellers only.",
          "- For each candidate include: company, country, region, segment, fit_score, potential_score, total_score, confidence, website, reason."
        ].join("\n");
      const guardedSimilarPrompt = `${taskBasePrompt}\n\n${similarResponseGuard}`;
      const primaryTaskPrompt = buildTaskPrompt(taskBasePrompt, {
        reference_customer: {
          name: companyName,
          registration_number: baseCustomer?.registrationNumber ?? null,
          nace_code: baseCustomer?.naceCode ?? null,
          country,
          region,
          industry,
          segment_focus: segmentFocus,
          website_data: compactWebsiteSnapshots
        },
        vendora: {
          countries_served: settings.countries,
          positioning: "Vendora Nordic channel distributor",
          assortment_catalog: vendorCatalogWebsites,
          strategic_focus: settings.industries
        },
        discovery_inputs: {
          candidate_pool_list: [],
          web_discovery_allowed: true,
          allowed_sources: registryHints
        },
        crm_context: {
          existing_customers: existingCustomersContext.names,
          existing_customer_domains: existingCustomersContext.domains
        },
        legal_filters: {
          prefer_same_country: true,
          disallow_directory_pages: true,
          prefer_official_registry_sources: true,
          sni_or_equivalent_groups: sniGroups,
          blocked_domains: settings.blockedSourceDomains
        },
        filters: {
          scope,
          countries: country ? [country] : settings.countries,
          regions: region ? [region] : [],
          segment_focus: segmentFocus,
          max_results_per_group: maxSimilar,
          exclude_distributors: true
        },
        additional_instructions: mergedExtraInstructions || null
      });
      let finalPrompt = composePrompt(settings.globalSystemPrompt, buildTaskPrompt(guardedSimilarPrompt, {
        reference_customer: {
          name: companyName,
          registration_number: baseCustomer?.registrationNumber ?? null,
          nace_code: baseCustomer?.naceCode ?? null,
          country,
          region,
          industry,
          segment_focus: segmentFocus,
          website_data: compactWebsiteSnapshots
        },
        vendora: {
          countries_served: settings.countries,
          positioning: "Vendora Nordic channel distributor",
          assortment_catalog: vendorCatalogWebsites,
          strategic_focus: settings.industries
        },
        discovery_inputs: {
          candidate_pool_list: [],
          web_discovery_allowed: true,
          allowed_sources: registryHints
        },
        crm_context: {
          existing_customers: existingCustomersContext.names,
          existing_customer_domains: existingCustomersContext.domains
        },
        customer_profile_enrichment: asObject(baseCustomer?.webshopSignals)?.research ?? null,
        legal_filters: {
          prefer_same_country: true,
          disallow_directory_pages: true,
          prefer_official_registry_sources: true,
          sni_or_equivalent_groups: sniGroups
        },
        filters: {
          scope,
          countries: country ? [country, ...settings.countries.filter((c) => c !== country)] : settings.countries,
          regions: region ? [region] : [],
          segment_focus: segmentFocus,
          max_results_per_group: maxSimilar,
          exclude_distributors: true
        },
        additional_instructions: mergedExtraInstructions || null
      }));
      let externalDiscovery: Awaited<ReturnType<typeof discoverExternalSeeds>> = {
        candidates: [],
        usedProviders: []
      };

      let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
      let aiError: string | null = null;
      try {
        aiResult = await generateWithGemini(finalPrompt, {
          systemPrompt: claudeSystemPrompt,
          userPrompt: primaryTaskPrompt,
          usePromptCaching: true,
          cacheTtl: settings.claudeCachingTtl
        });
      } catch (error) {
        aiError = error instanceof Error ? error.message : "Gemini request failed";
      }
      if (!aiResult && !aiError) {
        aiError = "Gemini unavailable: missing GEMINI_API_KEY or model access.";
      }

      if (aiResult?.outputText) {
        similarCustomers = extractSimilarCandidates(extractJsonValue(aiResult.outputText), maxSimilar);
        if (similarCustomers.length === 0) {
          similarCustomers = extractCandidatesFromMarkdownTable(aiResult.outputText, maxSimilar);
        }
        if (similarCustomers.length === 0) {
          similarCustomers = extractCandidatesFromText(aiResult.outputText, maxSimilar);
        }
      }

      similarCustomers = hardFilterCompanyCandidates(similarCustomers, settings.blockedSourceDomains);
      similarCustomers = enforceCountryAndRegistryQuality(similarCustomers, country, settings.blockedSourceDomains);
      similarCustomers = await validateCandidatesWithGemini(
        similarCustomers,
        { companyName, country, region, industry },
        settings.globalSystemPrompt
      );

      if (similarCustomers.length === 0) {
        externalDiscovery = await discoverExternalSeeds({
          companyName,
          country,
          region,
          industry,
          segmentFocus,
          maxResults: Math.min(800, Math.max(50, maxSimilar * 2)),
          excludeDomain: baseCustomer?.website ?? null,
          seedContext: [
            baseCustomer?.name,
            baseCustomer?.registrationNumber,
            baseCustomer?.industry,
            baseCustomer?.notes,
            JSON.stringify(asObject(baseCustomer?.webshopSignals)?.research ?? {}),
            ...websiteSnapshots.map(
              (snapshot) => `${snapshot.title ?? ""} ${snapshot.description ?? ""} ${snapshot.h1 ?? ""} ${snapshot.textSample ?? ""}`
            )
          ]
            .filter(Boolean)
            .join(" ")
        });
      }

      if (similarCustomers.length === 0 && externalDiscovery.candidates.length > 0) {
        const fallbackTaskPrompt = buildTaskPrompt(guardedSimilarPrompt, {
          reference_customer: {
            name: companyName,
            registration_number: baseCustomer?.registrationNumber ?? null,
            country,
            region,
            industry,
            segment_focus: segmentFocus,
            website_data: compactWebsiteSnapshots
          },
          vendora: {
            countries_served: settings.countries,
            positioning: "Vendora Nordic channel distributor",
            assortment_catalog: vendorCatalogWebsites,
            strategic_focus: settings.industries
          },
        discovery_inputs: {
          candidate_pool_list: externalDiscovery.candidates,
          web_discovery_allowed: false,
          allowed_sources: registryHints
        },
        crm_context: {
          existing_customers: existingCustomersContext.names,
          existing_customer_domains: existingCustomersContext.domains
        },
        customer_profile_enrichment: asObject(baseCustomer?.webshopSignals)?.research ?? null,
        legal_filters: {
            prefer_same_country: true,
            disallow_directory_pages: true,
            prefer_official_registry_sources: true,
            sni_or_equivalent_groups: sniGroups,
            blocked_domains: settings.blockedSourceDomains
          },
          filters: {
            scope,
            countries: country ? [country] : settings.countries,
            regions: region ? [region] : [],
            segment_focus: segmentFocus,
            max_results_per_group: maxSimilar,
            exclude_distributors: true
          },
          additional_instructions: mergedExtraInstructions || null
        });
        finalPrompt = composePrompt(settings.globalSystemPrompt, fallbackTaskPrompt);

        try {
          const fallbackAiResult = await generateWithGemini(finalPrompt, {
            systemPrompt: claudeSystemPrompt,
            userPrompt: fallbackTaskPrompt,
            usePromptCaching: true,
            cacheTtl: settings.claudeCachingTtl
          });
          if (fallbackAiResult?.outputText) {
            aiResult = fallbackAiResult;
            similarCustomers = extractSimilarCandidates(extractJsonValue(fallbackAiResult.outputText), maxSimilar);
            if (similarCustomers.length === 0) {
              similarCustomers = extractCandidatesFromMarkdownTable(fallbackAiResult.outputText, maxSimilar);
            }
            if (similarCustomers.length === 0) {
              similarCustomers = extractCandidatesFromText(fallbackAiResult.outputText, maxSimilar);
            }
          }
        } catch {
          // keep previous aiResult and continue fallback chain
        }

        similarCustomers = hardFilterCompanyCandidates(similarCustomers, settings.blockedSourceDomains);
        similarCustomers = enforceCountryAndRegistryQuality(similarCustomers, country, settings.blockedSourceDomains);
      }

      // Do not show raw discovery rows directly as candidates.
      // Only show model-ranked company candidates or CRM fallback.

      const allowCrmFallback = body.allowCrmFallback === true;
      if (similarCustomers.length === 0 && allowCrmFallback) {
        similarCustomers = await crmFallbackSimilarCustomers(
          baseCustomer,
          companyName,
          scope,
          country,
          region,
          industry,
          seller,
          potentialScore,
          segmentFocus,
          maxSimilar
        );
      }

      if (similarCustomers.length === 0 && !aiError) {
        const taskBasePrompt = body.basePrompt?.trim() || settings.similarCustomersPrompt;
        const retryPrompt = buildTaskPrompt(taskBasePrompt, {
          retry_mode: true,
          instruction: `Return strict JSON with at least ${Math.min(5, maxSimilar)} realistic reseller candidates.`,
          reference_customer: {
            name: companyName,
            country,
            region,
            industry,
            segment_focus: segmentFocus
          },
          discovery_inputs: {
            candidate_pool_list: externalDiscovery.candidates,
            web_discovery_allowed: externalDiscovery.candidates.length === 0,
            allowed_sources: registryHints
          },
          crm_context: {
            existing_customers: existingCustomersContext.names,
            existing_customer_domains: existingCustomersContext.domains
          },
          customer_profile_enrichment: asObject(baseCustomer?.webshopSignals)?.research ?? null,
          filters: {
            scope,
            max_results_per_group: maxSimilar
          }
        });

        try {
          const retryResult = await generateWithGemini(composePrompt(settings.globalSystemPrompt, retryPrompt), {
            systemPrompt: claudeSystemPrompt,
            userPrompt: retryPrompt,
            usePromptCaching: true,
            cacheTtl: settings.claudeCachingTtl
          });
          if (retryResult?.outputText) {
            similarCustomers = extractSimilarCandidates(extractJsonValue(retryResult.outputText), maxSimilar).map(
              (candidate) => ({
                ...candidate,
                sourceType: candidate.sourceType || "estimated",
                reason: candidate.reason || "Retry extraction",
                confidence: candidate.confidence || "low"
              })
            );
            similarCustomers = hardFilterCompanyCandidates(similarCustomers, settings.blockedSourceDomains);
            similarCustomers = enforceCountryAndRegistryQuality(similarCustomers, country, settings.blockedSourceDomains);
          }
        } catch {
          // keep previous result and surface status via aiError path above if present
        }
      }

      if (similarCustomers.length > 0) {
        const crmByName = new Map<string, { id: string; name: string }>();
        const crmByDomain = new Map<string, { id: string; name: string }>();
        for (const crm of existingCustomersContext.refs) {
          const normalizedName = normalizeCompanyName(crm.name);
          if (normalizedName && !crmByName.has(normalizedName)) {
            crmByName.set(normalizedName, { id: crm.id, name: crm.name });
          }
          if (crm.domain && !crmByDomain.has(crm.domain)) {
            crmByDomain.set(crm.domain, { id: crm.id, name: crm.name });
          }
        }

        similarCustomers = similarCustomers.map((candidate) => {
          const normalizedCandidate = normalizeCompanyName(candidate.name);
          const matchByName = crmByName.get(normalizedCandidate);
          const matchByDomain = crmByDomain.get(websiteDomain(candidate.website));
          let fuzzyMatch: { id: string; name: string } | null = null;
          if (!matchByDomain && !matchByName && normalizedCandidate) {
            let bestScore = 0;
            for (const crm of existingCustomersContext.refs) {
              const score = fuzzyCompanyNameScore(candidate.name, crm.name);
              if (score > bestScore) {
                bestScore = score;
                fuzzyMatch = crm;
              }
            }
            if (bestScore < 0.92) fuzzyMatch = null;
          }
          const match = matchByDomain || matchByName || fuzzyMatch || null;
          return {
            ...candidate,
            alreadyCustomer: Boolean(match),
            existingCustomerId: match?.id ?? null,
            existingCustomerName: match?.name ?? null
          };
        });

        // Safety post-filter: always prioritize non-customers first even if model misses this preference.
        similarCustomers = similarCustomers
          .sort((a, b) => {
            const aExisting = a.alreadyCustomer ? 1 : 0;
            const bExisting = b.alreadyCustomer ? 1 : 0;
            if (aExisting !== bExisting) return aExisting - bExisting;
            const aScore = Number.isFinite(Number(a.totalScore))
              ? Number(a.totalScore)
              : Number.isFinite(Number(a.matchScore))
              ? Number(a.matchScore)
              : 0;
            const bScore = Number.isFinite(Number(b.totalScore))
              ? Number(b.totalScore)
              : Number.isFinite(Number(b.matchScore))
              ? Number(b.matchScore)
              : 0;
            return bScore - aScore;
          })
          .slice(0, maxSimilar);
      }

      return NextResponse.json({
        query: {
          customerId: baseCustomer?.id ?? null,
          companyName,
          scope,
          country,
          region,
          seller,
          industry,
          segmentFocus,
          externalOnly: true
        },
        websiteSnapshots,
        similarCustomers,
        sourceAttribution: {
          web: websiteAttribution,
          externalSignals: externalDiscovery.candidates.map((candidate) => ({
            sourceType: candidate.sourceType || "external",
            url: candidate.website || candidate.sourceUrl || "",
            title: candidate.name
          })),
          discovery: {
            providers: externalDiscovery.usedProviders,
            seedCount: externalDiscovery.candidates.length
          }
        },
        aiPrompt: finalPrompt,
        aiResult,
        aiError,
        discovery: {
          providerCount: externalDiscovery.usedProviders.length,
          providers: externalDiscovery.usedProviders,
          seedCount: externalDiscovery.candidates.length
        }
      });
    }

    const similarCandidates = await prisma.customer.findMany({
      where: {
        ...(baseCustomer ? { id: { not: baseCustomer.id } } : {}),
        ...(scope === "country" && country ? { country } : {}),
        ...(scope === "region" && region ? { region } : {})
      },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        country: true,
        region: true,
        industry: true,
        seller: true,
        notes: true,
        potentialScore: true
      },
      take: 200
    });

    const segmentFilteredCandidates = similarCandidates.filter((candidate) => {
      const candidateSegment = inferSegmentFocus(
        [candidate.name, candidate.registrationNumber, candidate.industry, candidate.seller, candidate.notes]
          .filter(Boolean)
          .join(" ")
      );
      return segmentMatches(segmentFocus, candidateSegment);
    });

    const rankingPool = segmentFilteredCandidates.length >= 5 ? segmentFilteredCandidates : similarCandidates;

    const baseForRanking = {
      id: baseCustomer?.id ?? "external-target",
      name: companyName,
      country,
      region,
      industry,
      seller,
      potentialScore
    };

    similarCustomers = rankSimilarCustomers(baseForRanking, rankingPool).slice(0, maxSimilar);

    const aiPrompt = buildResearchPrompt({
      companyName,
      country,
      region,
      seller,
      basePotential: potentialScore,
      segmentFocus,
      basePrompt: body.basePrompt?.trim() || settings.fullResearchPrompt,
      websiteSnapshots,
      similarCustomers
    });

    const mergedExtraInstructions = [settings.extraInstructions, body.extraInstructions]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
    const taskBasePrompt = body.basePrompt?.trim() || settings.fullResearchPrompt;
    const taskPrompt = buildTaskPrompt(taskBasePrompt, {
      selected_account: {
        id: baseCustomer?.id ?? null,
        name: companyName,
        country,
        region,
        industry,
        segment_focus: segmentFocus,
        seller_owner: seller,
        legacy_potential_score: potentialScore
      },
      vendora: {
        countries_served: settings.countries,
        positioning: "Vendora Nordic channel distributor",
        assortment_catalog: vendorCatalogWebsites,
        strategic_focus: settings.industries,
        constraints: []
      },
      research_inputs: {
        website_data: compactWebsiteSnapshots,
        similar_candidates_from_crm: similarCustomers,
        manual_brand_revenue: asArray(asObject(baseCustomer?.webshopSignals)?.manualBrandRevenue),
        internal_notes: [baseCustomer?.notes].filter(Boolean)
      },
      generated_context: aiPrompt,
      filters: {
        scope,
        segment_focus: segmentFocus,
        max_similar: maxSimilar
      },
      additional_instructions: mergedExtraInstructions || null
    });
    const finalPrompt = composePrompt(settings.globalSystemPrompt, taskPrompt);
    const claudeSystemPrompt = settings.claudeCachingSystemPrompt || settings.globalSystemPrompt;

    let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
    let aiError: string | null = null;

    try {
      aiResult = await generateWithGemini(finalPrompt, {
        systemPrompt: claudeSystemPrompt,
        userPrompt: buildClaudeUserPrompt(settings.claudeCachingUserPrompt, taskBasePrompt, {
          selected_account: {
            id: baseCustomer?.id ?? null,
            name: companyName,
            country,
            region,
            industry,
            segment_focus: segmentFocus,
            seller_owner: seller,
            legacy_potential_score: potentialScore
          },
          vendora: {
            countries_served: settings.countries,
            positioning: "Vendora Nordic channel distributor",
            assortment_catalog: vendorCatalogWebsites,
            strategic_focus: settings.industries,
            constraints: []
          },
          research_inputs: {
            website_data: compactWebsiteSnapshots,
            similar_candidates_from_crm: similarCustomers,
            manual_brand_revenue: asArray(asObject(baseCustomer?.webshopSignals)?.manualBrandRevenue),
            internal_notes: [baseCustomer?.notes].filter(Boolean)
          },
          generated_context: aiPrompt,
          filters: {
            scope,
            segment_focus: segmentFocus,
            max_similar: maxSimilar
          },
          additional_instructions: mergedExtraInstructions || null
        }),
        usePromptCaching: true,
        cacheTtl: settings.claudeCachingTtl
      });
    } catch (error) {
      aiError = error instanceof Error ? error.message : "Gemini request failed";
    }
    if (!aiResult && !aiError) {
      aiError = "Gemini unavailable: missing GEMINI_API_KEY or model access.";
    }

    const structuredInsight = aiResult?.outputText ? parseStructuredResearchInsight(aiResult.outputText) : null;
    const localAssortmentFitScore = computeAssortmentFitScoreFromSnapshots(
      customerWebsiteSnapshots,
      vendoraWebsiteSnapshots
    );
    const structuredWithFallback =
      structuredInsight && structuredInsight.assortmentFitScore === null && localAssortmentFitScore !== null
        ? { ...structuredInsight, assortmentFitScore: localAssortmentFitScore }
        : structuredInsight;

    return NextResponse.json({
      query: {
        customerId: baseCustomer?.id ?? null,
        companyName,
        scope,
        country,
        region,
        seller,
        industry,
        segmentFocus
      },
      websiteSnapshots,
      similarCustomers,
      structuredInsight: structuredWithFallback,
      localAssortmentFitScore,
      aiPrompt: finalPrompt,
      aiResult,
      aiError
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
