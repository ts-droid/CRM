import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildResearchPrompt } from "@/lib/research/prompt";
import { rankSimilarCustomers } from "@/lib/research/similarity";
import { fetchWebsiteSnapshot, normalizeUrl } from "@/lib/research/web";
import { generateWithGemini } from "@/lib/research/llm";
import { getResearchConfig } from "@/lib/admin/settings";

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
};

type SegmentFocus = "B2B" | "B2C" | "MIXED";

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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;
    const settings = await getResearchConfig();
    const scope = body.scope === "country" ? "country" : body.scope === "region" ? "region" : settings.defaultScope;
    const maxSimilar = Math.max(1, Math.min(20, body.maxSimilar ?? 10));

    let baseCustomer = null as null | {
      id: string;
      name: string;
      organization: string | null;
      country: string | null;
      region: string | null;
      industry: string | null;
      seller: string | null;
      website: string | null;
      notes: string | null;
      potentialScore: number;
    };

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

    let similarCustomers: Array<{
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

    if (body.externalOnly) {
      const registryHints = registryHintsForCountry(country);
      const externalPrompt = [
        body.basePrompt?.trim() || settings.quickSimilarBasePrompt,
        "",
        "Task:",
        `Find ${maxSimilar} similar reseller companies for this target using external/public information only.`,
        "Do NOT use any internal CRM list.",
        "",
        "Target:",
        `- Name: ${companyName}`,
        `- Organization / org no hint: ${baseCustomer?.organization ?? "-"}`,
        `- Country: ${country ?? "-"}`,
        `- Region: ${region ?? "-"}`,
        `- Industry: ${industry ?? "-"}`,
        `- Segment focus: ${segmentFocus}`,
        `- Scope: ${scope}`,
        "",
        "Use these source categories first:",
        `- ${registryHints.join(", ")}`,
        "",
        "Rules:",
        "- Prefer official registers and trustworthy business directories.",
        "- If region has too few hits, widen to same country.",
        "- Only reseller/end-retail companies (not distributors unless clearly retail-facing).",
        "- Include confidence and a short reason for each candidate.",
        "",
        "Output strict JSON only (no extra text) with schema:",
        "{",
        '  "candidates": [',
        "    {",
        '      "name": "string",',
        '      "country": "string|null",',
        '      "region": "string|null",',
        '      "industry": "string|null",',
        '      "website": "string|null",',
        '      "organizationNumber": "string|null",',
        '      "matchScore": 0,',
        '      "potentialScore": 0,',
        '      "reason": "string",',
        '      "sourceType": "register|directory|estimated",',
        '      "sourceUrl": "string|null",',
        '      "confidence": "high|medium|low"',
        "    }",
        "  ]",
        "}"
      ].join("\n");

      const mergedExtraInstructions = [settings.quickSimilarExtraInstructions, settings.extraInstructions, body.extraInstructions]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join("\n\n");

      const finalPrompt = mergedExtraInstructions
        ? `${externalPrompt}\n\nAdditional internal instructions:\n${mergedExtraInstructions}`
        : externalPrompt;

      let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
      let aiError: string | null = null;
      try {
        aiResult = await generateWithGemini(finalPrompt);
      } catch (error) {
        aiError = error instanceof Error ? error.message : "Gemini request failed";
      }

      if (aiResult?.outputText) {
        const parsed = extractJsonObject(aiResult.outputText);
        const rows = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
        similarCustomers = rows
          .map((row, index) => {
            const item = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
            return {
              id: `external-${index + 1}`,
              name: String(item.name ?? "").trim(),
              country: item.country ? String(item.country) : null,
              region: item.region ? String(item.region) : null,
              industry: item.industry ? String(item.industry) : null,
              seller: null,
              potentialScore: Number(item.potentialScore ?? 50),
              matchScore: Number(item.matchScore ?? 50),
              website: item.website ? String(item.website) : null,
              organizationNumber: item.organizationNumber ? String(item.organizationNumber) : null,
              reason: item.reason ? String(item.reason) : null,
              sourceType: item.sourceType ? String(item.sourceType) : null,
              sourceUrl: item.sourceUrl ? String(item.sourceUrl) : null,
              confidence: item.confidence ? String(item.confidence) : null
            };
          })
          .filter((item) => item.name)
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
        aiPrompt: finalPrompt,
        aiResult,
        aiError
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
      basePrompt: body.basePrompt?.trim() || settings.researchBasePrompt,
      websiteSnapshots,
      similarCustomers
    });

    const mergedExtraInstructions = [settings.extraInstructions, body.extraInstructions]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n\n");

    const finalPrompt = mergedExtraInstructions
      ? `${aiPrompt}\n\nAdditional internal instructions:\n${mergedExtraInstructions}`
      : aiPrompt;

    let aiResult: Awaited<ReturnType<typeof generateWithGemini>> = null;
    let aiError: string | null = null;

    try {
      aiResult = await generateWithGemini(finalPrompt);
    } catch (error) {
      aiError = error instanceof Error ? error.message : "Gemini request failed";
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
