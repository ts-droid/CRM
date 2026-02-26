import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildResearchPrompt } from "@/lib/research/prompt";
import { rankSimilarCustomers } from "@/lib/research/similarity";
import { fetchWebsiteSnapshot, normalizeUrl } from "@/lib/research/web";
import { generateWithGemini } from "@/lib/research/llm";
import { getResearchConfig } from "@/lib/admin/settings";
import { discoverExternalSeeds } from "@/lib/research/discovery";

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
  totalScore?: number | null;
  similarityScore?: number | null;
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
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) candidates.push(fencedMatch[1].trim());
  const genericFence = trimmed.match(/```\s*([\s\S]*?)```/i);
  if (genericFence?.[1]) candidates.push(genericFence[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next candidate
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
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
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

function hardFilterCompanyCandidates(candidates: SimilarCandidate[]): SimilarCandidate[] {
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
    "sortlist.com"
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

function toScore(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSimilarCandidate(row: unknown, index: number): SimilarCandidate | null {
  const item = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const name = String(item.name ?? item.company ?? "").trim();
  if (!name) return null;

  return {
    id: `external-${index + 1}`,
    name,
    country: item.country ? String(item.country) : null,
    region: item.region ? String(item.region) : null,
    industry: item.industry ? String(item.industry) : null,
    seller: null,
    potentialScore: toScore(item.potentialScore ?? item.potential_score ?? item.potential ?? 50, 50),
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
    totalScore: toScore(item.totalScore ?? item.total_score ?? null, Number.NaN),
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
    const maxSimilar = Math.max(1, Math.min(20, body.maxSimilar ?? 10));

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
          potentialScore: true
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

    const urlSet = new Set<string>();
    if (baseCustomer?.website) urlSet.add(normalizeUrl(baseCustomer.website));
    if (!body.externalOnly) {
      for (const website of [...settings.vendorWebsites, ...settings.brandWebsites]) {
        if (website?.trim()) {
          urlSet.add(normalizeUrl(website));
        }
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

    let similarCustomers: SimilarCandidate[] = [];

    if (body.externalOnly) {
      if (body.externalMode === "profile") {
        const mergedExtraInstructions = [settings.extraInstructions, body.extraInstructions]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
        const taskBasePrompt = body.basePrompt?.trim() || settings.followupCustomerClickPrompt;
        const taskPrompt = buildTaskPrompt(taskBasePrompt, {
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
            assortment_catalog: websites,
            strategic_focus: settings.industries,
            constraints: [],
            onboarding_link: settings.vendorWebsites[0] ?? null
          },
          research_inputs: {
            website_data: websiteSnapshots,
            public_company_data: {},
            category_signals: [industry].filter(Boolean),
            brand_signals: [],
            size_signals: {},
            contact_signals: [],
            internal_notes: [baseCustomer?.notes].filter(Boolean)
          },
          filters: {
            scope,
            exclude_distributors: true
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
          similarCustomers: [],
          aiPrompt: finalPrompt,
          aiResult,
          aiError
        });
      }

      const externalDiscovery = await discoverExternalSeeds({
        companyName,
        country,
        region,
        industry,
        segmentFocus,
        maxResults: Math.max(10, maxSimilar * 2),
        excludeDomain: baseCustomer?.website ?? null,
        seedContext: [
          baseCustomer?.name,
          baseCustomer?.organization,
          baseCustomer?.industry,
          baseCustomer?.notes,
          ...websiteSnapshots.map((snapshot) => `${snapshot.title ?? ""} ${snapshot.description ?? ""} ${snapshot.h1 ?? ""} ${snapshot.textSample ?? ""}`)
        ]
          .filter(Boolean)
          .join(" ")
      });

      const mergedExtraInstructions = [settings.quickSimilarExtraInstructions, settings.extraInstructions, body.extraInstructions]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join("\n\n");
      const registryHints = registryHintsForCountry(country);
      const taskBasePrompt = body.basePrompt?.trim() || settings.similarCustomersPrompt;
      const taskPrompt = buildTaskPrompt(taskBasePrompt, {
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
          assortment_catalog: websites,
          strategic_focus: settings.industries
        },
        discovery_inputs: {
          candidate_pool_list: externalDiscovery.candidates,
          web_discovery_allowed: externalDiscovery.candidates.length === 0,
          allowed_sources: registryHints
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

      if (aiResult?.outputText) {
        similarCustomers = extractSimilarCandidates(extractJsonValue(aiResult.outputText), maxSimilar);
      }

      similarCustomers = hardFilterCompanyCandidates(similarCustomers);
      similarCustomers = await validateCandidatesWithGemini(
        similarCustomers,
        { companyName, country, region, industry },
        settings.globalSystemPrompt
      );

      if (similarCustomers.length === 0 && externalDiscovery.candidates.length > 0) {
        similarCustomers = externalDiscovery.candidates.slice(0, maxSimilar).map((candidate, index) => ({
          id: `external-seed-${index + 1}`,
          name: candidate.name,
          country: country ?? null,
          region: region ?? null,
          industry: industry ?? null,
          seller: null,
          potentialScore: 45,
          matchScore: 45,
          website: candidate.website,
          organizationNumber: null,
          reason: candidate.snippet || "External discovery seed",
          sourceType: candidate.sourceType,
          sourceUrl: candidate.sourceUrl,
          confidence: "low"
        }));
        similarCustomers = hardFilterCompanyCandidates(similarCustomers);
      }

      if (similarCustomers.length === 0 && aiResult?.outputText) {
        similarCustomers = extractCandidatesFromText(aiResult.outputText, maxSimilar);
        similarCustomers = hardFilterCompanyCandidates(similarCustomers);
      }

      if (similarCustomers.length === 0) {
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
        assortment_catalog: websites,
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
      aiPrompt: finalPrompt,
      aiResult,
      aiError
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
