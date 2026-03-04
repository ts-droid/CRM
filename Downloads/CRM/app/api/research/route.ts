import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildResearchPrompt } from "@/lib/research/prompt";
import { rankSimilarCustomers } from "@/lib/research/similarity";
import { fetchWebsiteSnapshot, normalizeUrl } from "@/lib/research/web";
import { generateWithGemini } from "@/lib/research/llm";
import { getResearchConfig } from "@/lib/admin/settings";
import { discoverExternalSeeds } from "@/lib/research/discovery";

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
type MinimalCustomer = {
  id: string;
  name: string;
  organization: string | null;
  country: string | null;
  region: string | null;
  industry: string | null;
  seller: string | null;
  notes?: string | null;
  potentialScore: number;
  website?: string | null;
  webshopSignals?: unknown;
};

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

  const summaryObj = asObject(root.target_account_summary) ?? asObject(root.account_summary) ?? {};
  const scoreObj = asObject(root.vendora_match_scorecard) ?? asObject(root.vendora_fit_scorecard) ?? {};
  const yearObj = asObject(scoreObj.year_1_purchase_potential) ?? {};

  const categoriesRows = asArray(root.best_categories_to_pitch).length
    ? asArray(root.best_categories_to_pitch)
    : asArray(root.recommended_categories_to_pitch);
  const namedContactsRows = asArray(asObject(root.contact_paths)?.named_contacts);
  const rolePathsRows = asArray(asObject(root.contact_paths)?.role_based_paths);

  const summary = asString(summaryObj.summary);
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
    nextBestActions: asStringArray(root.next_best_actions),
    raw: root
  };

  if (
    !insight.summary &&
    !insight.commercialRelevance &&
    !insight.categoriesToPitch.length &&
    !insight.nextBestActions.length &&
    insight.totalScore === null
  ) {
    return null;
  }

  return insight;
}

async function saveResearchInsightToCustomer(
  customerId: string,
  insight: StructuredResearchInsight,
  model: string | null
) {
  const existing = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, potentialScore: true, webshopSignals: true, notes: true }
  });
  if (!existing) return null;

  const currentSignals = asObject(existing.webshopSignals) ?? {};
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
      model: model || null,
      updatedAt: new Date().toISOString()
    }
  };

  const nextPotential =
    insight.totalScore !== null ? clampScore(insight.totalScore, existing.potentialScore) : existing.potentialScore;

  const noteLine = insight.summary
    ? `[AI research ${new Date().toISOString()}] ${insight.summary}`
    : `[AI research ${new Date().toISOString()}] Research updated`;
  const prevNotes = asString(existing.notes);
  const mergedNotes = [noteLine, prevNotes].filter(Boolean).join("\n\n").slice(0, 12000);

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      potentialScore: nextPotential,
      notes: mergedNotes,
      webshopSignals: nextSignals
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
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
    const result = await generateWithGemini(prompt);
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
      organization: true,
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
      [candidate.name, candidate.organization, candidate.industry, candidate.seller, candidate.notes].filter(Boolean).join(" ")
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
    const settings = await getResearchConfig();
    const scope = body.scope === "country" ? "country" : body.scope === "region" ? "region" : settings.defaultScope;
    const maxSimilar = Math.max(1, Math.min(500, body.maxSimilar ?? 10));

    let baseCustomer = null as null | MinimalCustomer;

    if (body.customerId) {
      baseCustomer = await prisma.customer.findUnique({
        where: { id: body.customerId },
        select: {
          id: true,
          name: true,
          organization: true,
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
          baseCustomer?.organization,
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

    const urlSet = new Set<string>();
    if (baseCustomer?.website) urlSet.add(normalizeUrl(baseCustomer.website));
    if (!body.externalOnly || body.externalMode === "profile") {
      for (const website of vendorCatalogWebsites) {
        urlSet.add(website);
      }
    }
    for (const website of body.websites ?? []) {
      if (website?.trim()) {
        urlSet.add(normalizeUrl(website));
      }
    }

    const websites = Array.from(urlSet).slice(0, 6);

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
    const customerWebsiteSnapshots = websiteSnapshots.filter((snapshot) => !isVendoraWebsite(snapshot.url));
    const vendoraWebsiteSnapshots = websiteSnapshots.filter((snapshot) => isVendoraWebsite(snapshot.url));

    let similarCustomers: SimilarCandidate[] = [];

    if (body.externalOnly) {
      if (body.externalMode === "profile") {
        const companySignals = await discoverCompanySignals({
          companyName,
          country,
          region,
          organizationNumber: baseCustomer?.organization ?? null,
          website: baseCustomer?.website ?? null,
          industry,
          maxResults: 14,
          blockedDomains: settings.blockedSourceDomains,
          preferredDomains: settings.preferredSourceDomains
        });
        const mergedExtraInstructions = [settings.extraInstructions, body.extraInstructions]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
        const taskBasePrompt =
          body.basePrompt?.trim() || settings.fullResearchPrompt || settings.followupCustomerClickPrompt;
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
          "- Be specific for the selected account, not generic."
        ].join("\n");
        const deepProfileJsonShape = [
          "RETURN THIS EXACT JSON SHAPE:",
          "{",
          '  "account_summary": {',
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
            organization: baseCustomer?.organization ?? null,
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
            website_data: websiteSnapshots,
            customer_profile_enrichment: asObject(baseCustomer?.webshopSignals)?.research ?? null,
            public_company_data: {
              signals: companySignals
            },
            category_signals: [industry].filter(Boolean),
            brand_signals: [],
            size_signals: companySignals
              .map((signal) => signal.snippet)
              .filter((snippet) => /(revenue|omsättning|employees|anställda|turnover|stores)/i.test(snippet)),
            contact_signals: companySignals
              .map((signal) => signal.snippet)
              .filter((snippet) => /(buyer|procurement|category manager|inköp|inkop|business sales)/i.test(snippet)),
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
        const taskPrompt = buildTaskPrompt(`${taskBasePrompt}\n\n${deepProfileGuard}\n\n${deepProfileJsonShape}`, profilePayload);
        const finalPrompt = composePrompt(settings.globalSystemPrompt, taskPrompt);

        let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
        let aiError: string | null = null;
        try {
          aiResult = await generateWithGemini(finalPrompt);
        } catch (error) {
          aiError = error instanceof Error ? error.message : "Gemini request failed";
        }
        if (!aiResult && !aiError) {
          aiError = "Gemini unavailable: missing GEMINI_API_KEY or model access.";
        }

        const firstStructured = aiResult?.outputText ? parseStructuredResearchInsight(aiResult.outputText) : null;
        const outputTooShort =
          (aiResult?.outputText?.trim().length ?? 0) < 1200 ||
          !firstStructured ||
          (firstStructured.categoriesToPitch?.length ?? 0) < 5 ||
          (firstStructured.nextBestActions?.length ?? 0) < 6;
        if (!aiError && outputTooShort) {
          const retryPrompt = composePrompt(
            settings.globalSystemPrompt,
            buildTaskPrompt(
              `${taskBasePrompt}\n\n${deepProfileGuard}\n\n${deepProfileJsonShape}\n\nCRITICAL RETRY INSTRUCTION: The previous answer was too short or not parseable. Return only complete JSON shape with deeper commercial detail, quantified ranges, and concrete account-specific recommendations.`,
              profilePayload
            )
          );
          try {
            const retryResult = await generateWithGemini(retryPrompt);
            if ((retryResult?.outputText?.trim().length ?? 0) > (aiResult?.outputText?.trim().length ?? 0)) {
              aiResult = retryResult;
            }
          } catch {
            // Keep original result if retry fails.
          }
        }

        let structuredInsight = aiResult?.outputText ? parseStructuredResearchInsight(aiResult.outputText) : null;
        const needsHardFallback =
          !aiError &&
          aiResult?.outputText &&
          (!structuredInsight ||
            (structuredInsight.categoriesToPitch?.length ?? 0) < 4 ||
            (structuredInsight.nextBestActions?.length ?? 0) < 5);
        if (needsHardFallback) {
          const hardFallbackPrompt = composePrompt(
            settings.globalSystemPrompt,
            buildTaskPrompt(
              [
                "TASK: Deep commercial account research for one selected customer account.",
                "Return ONLY valid JSON using the exact required JSON shape.",
                "No markdown. No prose outside JSON.",
                "Must include:",
                "- fit_score, assortment_fit_score, potential_score, total_score",
                "- year_1_purchase_potential low/base/high",
                "- at least 8 recommended categories to pitch",
                "- at least 8 next_best_actions",
                "- score_drivers and assumptions with confidence."
              ].join("\n"),
              profilePayload
            )
          );
          try {
            const hardFallbackResult = await generateWithGemini(hardFallbackPrompt);
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
        const localAssortmentFitScore = computeAssortmentFitScoreFromSnapshots(
          customerWebsiteSnapshots,
          vendoraWebsiteSnapshots
        );
        const structuredWithFallback =
          structuredInsight && structuredInsight.assortmentFitScore === null && localAssortmentFitScore !== null
            ? { ...structuredInsight, assortmentFitScore: localAssortmentFitScore }
            : structuredInsight;
        let savedInsight = null;
        if (baseCustomer?.id && structuredWithFallback) {
          savedInsight = await saveResearchInsightToCustomer(baseCustomer.id, structuredWithFallback, aiResult?.model ?? null);
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
          similarCustomers: [],
          structuredInsight: structuredWithFallback,
          localAssortmentFitScore,
          savedInsight,
          usedExtraInstructions: mergedExtraInstructions || null,
          aiPrompt: finalPrompt,
          aiResult,
          aiError
        });
      }

      const mergedExtraInstructions = [settings.quickSimilarExtraInstructions, settings.extraInstructions, body.extraInstructions]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
      const registryHints = Array.from(
        new Set([...registryHintsForCountry(country), ...settings.registrySourceUrls, ...settings.preferredSourceDomains])
      ).slice(0, 40);
      const sniGroups = likelySniGroupFromIndustry(industry);
      const taskBasePrompt = body.basePrompt?.trim() || settings.similarCustomersPrompt;
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
          organization: baseCustomer?.organization ?? null,
          country,
          region,
          industry,
          segment_focus: segmentFocus,
          website_data: websiteSnapshots
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
          organization: baseCustomer?.organization ?? null,
          country,
          region,
          industry,
          segment_focus: segmentFocus,
          website_data: websiteSnapshots
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
        aiResult = await generateWithGemini(finalPrompt);
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
            baseCustomer?.organization,
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
            organization: baseCustomer?.organization ?? null,
            country,
            region,
            industry,
            segment_focus: segmentFocus,
            website_data: websiteSnapshots
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
          const fallbackAiResult = await generateWithGemini(finalPrompt);
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
          customer_profile_enrichment: asObject(baseCustomer?.webshopSignals)?.research ?? null,
          filters: {
            scope,
            max_results_per_group: maxSimilar
          }
        });

        try {
          const retryResult = await generateWithGemini(composePrompt(settings.globalSystemPrompt, retryPrompt));
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
        const crmCustomers = await prisma.customer.findMany({
          select: {
            id: true,
            name: true,
            website: true
          }
        });

        const crmByName = new Map<string, { id: string; name: string }>();
        const crmByDomain = new Map<string, { id: string; name: string }>();
        for (const crm of crmCustomers) {
          const normalizedName = normalizeCompanyName(crm.name);
          if (normalizedName && !crmByName.has(normalizedName)) {
            crmByName.set(normalizedName, { id: crm.id, name: crm.name });
          }
          const domain = websiteDomain(crm.website);
          if (domain && !crmByDomain.has(domain)) {
            crmByDomain.set(domain, { id: crm.id, name: crm.name });
          }
        }

        similarCustomers = similarCustomers.map((candidate) => {
          const matchByName = crmByName.get(normalizeCompanyName(candidate.name));
          const matchByDomain = crmByDomain.get(websiteDomain(candidate.website));
          const match = matchByDomain || matchByName || null;
          return {
            ...candidate,
            alreadyCustomer: Boolean(match),
            existingCustomerId: match?.id ?? null,
            existingCustomerName: match?.name ?? null
          };
        });
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
        organization: true,
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
        [candidate.name, candidate.organization, candidate.industry, candidate.seller, candidate.notes]
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
        website_data: websiteSnapshots,
        similar_candidates_from_crm: similarCustomers,
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

    let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
    let aiError: string | null = null;

    try {
      aiResult = await generateWithGemini(finalPrompt);
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
