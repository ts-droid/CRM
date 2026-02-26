export type DiscoverySeed = {
  name: string;
  website: string | null;
  sourceUrl: string;
  sourceType: "serper" | "tavily";
  snippet: string;
};

type DiscoveryInput = {
  companyName: string;
  country?: string | null;
  region?: string | null;
  industry?: string | null;
  segmentFocus?: "B2B" | "B2C" | "MIXED";
  maxResults?: number;
  excludeDomain?: string | null;
};

type SerperResponse = {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
};

type TavilyResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
  }>;
};

function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
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

function guessNameFromTitleOrUrl(title: string, url: string): string {
  const cleanTitle = String(title)
    .replace(/\s+/g, " ")
    .trim();
  const titleCut = cleanTitle.split(" | ")[0]?.split(" - ")[0]?.split(" – ")[0]?.trim() || "";
  if (titleCut.length >= 3) return titleCut;

  const domain = toDomain(url);
  if (!domain) return "";
  const [head] = domain.split(".");
  return head ? head.replace(/[-_]+/g, " ").trim() : "";
}

function buildDiscoveryQuery(input: DiscoveryInput): string {
  const parts = [
    `companies similar to ${input.companyName}`,
    "reseller",
    "retail",
    input.industry || "",
    input.segmentFocus === "B2B" ? "B2B" : input.segmentFocus === "B2C" ? "B2C" : "",
    input.region || "",
    input.country || ""
  ]
    .map((item) => String(item).trim())
    .filter(Boolean);
  return parts.join(" ");
}

async function fetchSerperSeeds(query: string, maxResults: number): Promise<DiscoverySeed[]> {
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
      num: Math.min(20, Math.max(5, maxResults))
    }),
    cache: "no-store"
  });

  if (!response.ok) return [];
  const data = (await response.json()) as SerperResponse;
  const rows = Array.isArray(data.organic) ? data.organic : [];

  return rows
    .map((row): DiscoverySeed | null => {
      const sourceUrl = String(row.link ?? "").trim();
      if (!sourceUrl) return null;
      const name = guessNameFromTitleOrUrl(String(row.title ?? ""), sourceUrl);
      if (!name) return null;
      return {
        name,
        website: sourceUrl,
        sourceUrl,
        sourceType: "serper" as const,
        snippet: String(row.snippet ?? "").slice(0, 400)
      };
    })
    .filter((item): item is DiscoverySeed => item !== null);
}

async function fetchTavilySeeds(query: string, maxResults: number): Promise<DiscoverySeed[]> {
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
      max_results: Math.min(20, Math.max(5, maxResults)),
      search_depth: "basic"
    }),
    cache: "no-store"
  });

  if (!response.ok) return [];
  const data = (await response.json()) as TavilyResponse;
  const rows = Array.isArray(data.results) ? data.results : [];

  return rows
    .map((row): DiscoverySeed | null => {
      const sourceUrl = String(row.url ?? "").trim();
      if (!sourceUrl) return null;
      const name = guessNameFromTitleOrUrl(String(row.title ?? ""), sourceUrl);
      if (!name) return null;
      return {
        name,
        website: sourceUrl,
        sourceUrl,
        sourceType: "tavily" as const,
        snippet: String(row.content ?? "").slice(0, 400)
      };
    })
    .filter((item): item is DiscoverySeed => item !== null);
}

export async function discoverExternalSeeds(input: DiscoveryInput): Promise<{
  candidates: DiscoverySeed[];
  usedProviders: string[];
}> {
  const maxResults = Math.min(20, Math.max(6, input.maxResults ?? 12));
  const query = buildDiscoveryQuery(input);

  const [serper, tavily] = await Promise.all([
    fetchSerperSeeds(query, maxResults),
    fetchTavilySeeds(query, maxResults)
  ]);

  const usedProviders: string[] = [];
  if (serper.length > 0) usedProviders.push("serper");
  if (tavily.length > 0) usedProviders.push("tavily");

  const excludeDomain = toDomain(input.excludeDomain ?? "");
  const seenByName = new Set<string>();
  const seenByDomain = new Set<string>();
  const merged: DiscoverySeed[] = [];

  for (const row of [...serper, ...tavily]) {
    const normalizedName = normalizeCompanyName(row.name);
    const domain = toDomain(row.website || row.sourceUrl);
    if (!normalizedName || seenByName.has(normalizedName)) continue;
    if (domain) {
      if (excludeDomain && domain === excludeDomain) continue;
      if (seenByDomain.has(domain)) continue;
    }
    seenByName.add(normalizedName);
    if (domain) seenByDomain.add(domain);
    merged.push(row);
    if (merged.length >= maxResults) break;
  }

  return {
    candidates: merged,
    usedProviders
  };
}
