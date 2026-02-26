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

const BLOCKED_DOMAINS = new Set([
  "trustpilot.com",
  "companydata.com",
  "crunchbase.com",
  "owler.com",
  "zoominfo.com",
  "apollo.io",
  "yelp.com",
  "glassdoor.com",
  "bullfincher.io",
  "f6s.com",
  "lusha.com",
  "ensun.io",
  "kompass.com",
  "wikipedia.org",
  "linkedin.com"
]);

const BLOCKED_PATH_PARTS = [
  "/review/",
  "/reviews/",
  "/ranking/",
  "/rankings/",
  "/list/",
  "/lists/",
  "/blog/",
  "/news/",
  "/article/",
  "/articles/",
  "/category/",
  "/categories/",
  "/wp-content/",
  "/files/",
  "/download",
  "/downloads/",
  "/pdf",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx"
];

const GENERIC_TITLE_PATTERNS = [
  /\btop\s+\d+/i,
  /\bbest\b/i,
  /\blargest\b/i,
  /\branking\b/i,
  /\bcompanies\b/i,
  /\bsuppliers\b/i,
  /\blist\b/i,
  /\bmarket\b/i,
  /\bby\s+revenue\b/i,
  /\bnear\s+me\b/i
];

const COMPANY_SUFFIXES = [
  "ab",
  "as",
  "a/s",
  "oy",
  "oyj",
  "aps",
  "oü",
  "sia",
  "uab",
  "gmbh",
  "ltd",
  "inc",
  "llc"
];

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

function isBlockedPath(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const normalizedPath = `${url.pathname}${url.search}`.toLowerCase();
    if (!normalizedPath || normalizedPath === "/" || normalizedPath.length <= 1) return false;
    return BLOCKED_PATH_PARTS.some((part) => normalizedPath.includes(part));
  } catch {
    return true;
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

function hasCompanySuffix(name: string): boolean {
  const lower = name.toLowerCase().replace(/\./g, "").trim();
  return COMPANY_SUFFIXES.some((suffix) => new RegExp(`\\b${suffix}\\b`, "i").test(lower));
}

function isLikelyGenericTitle(name: string): boolean {
  const normalized = String(name).trim();
  if (!normalized) return true;
  if (normalized.length > 90) return true;
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isBlockedDomain(domain: string): boolean {
  if (!domain) return true;
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function looksLikeCompany(seed: DiscoverySeed): boolean {
  const url = seed.website || seed.sourceUrl;
  const domain = toDomain(url);
  if (isBlockedDomain(domain)) return false;
  if (isBlockedPath(url)) return false;

  const titleLooksGeneric = isLikelyGenericTitle(seed.name);
  if (!titleLooksGeneric && seed.name.length >= 3) return true;

  const domainHead = domain.split(".")[0] || "";
  if (!domainHead) return false;
  const domainName = domainHead.replace(/[-_]+/g, " ").trim();
  if (domainName.length < 3) return false;

  return hasCompanySuffix(domainName) || !isLikelyGenericTitle(domainName);
}

function buildDiscoveryQueries(input: DiscoveryInput): string[] {
  const parts = [
    `"${input.companyName}"`,
    "reseller",
    input.industry || "",
    input.segmentFocus === "B2B" ? "B2B" : input.segmentFocus === "B2C" ? "B2C" : "",
    input.region || "",
    input.country || ""
  ]
    .map((item) => String(item).trim())
    .filter(Boolean);
  const base = parts.join(" ");

  const companySuffixHint = (input.country || "").toUpperCase() === "SE" ? "AB" : "company";

  return [
    `${base} competitors`,
    `${base} similar companies`,
    `${input.industry || "retail"} ${input.region || ""} ${input.country || ""} ${companySuffixHint}`.trim()
  ];
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
  const queries = buildDiscoveryQueries(input).slice(0, 3);

  const serperAll = (
    await Promise.all(queries.map((query) => fetchSerperSeeds(query, Math.max(8, maxResults))))
  ).flat();
  const tavilyAll = (
    await Promise.all(queries.map((query) => fetchTavilySeeds(query, Math.max(8, maxResults))))
  ).flat();

  const usedProviders: string[] = [];
  if (serperAll.length > 0) usedProviders.push("serper");
  if (tavilyAll.length > 0) usedProviders.push("tavily");

  const excludeDomain = toDomain(input.excludeDomain ?? "");
  const seenByName = new Set<string>();
  const seenByDomain = new Set<string>();
  const merged: DiscoverySeed[] = [];

  for (const row of [...serperAll, ...tavilyAll]) {
    if (!looksLikeCompany(row)) continue;
    const domain = toDomain(row.website || row.sourceUrl);
    const domainHead = domain.split(".")[0]?.replace(/[-_]+/g, " ").trim() || "";
    const candidateName = isLikelyGenericTitle(row.name) && domainHead ? domainHead : row.name;
    const normalizedName = normalizeCompanyName(candidateName);
    if (!normalizedName || seenByName.has(normalizedName)) continue;
    if (domain) {
      if (excludeDomain && domain === excludeDomain) continue;
      if (seenByDomain.has(domain)) continue;
    }
    seenByName.add(normalizedName);
    if (domain) seenByDomain.add(domain);
    merged.push({
      ...row,
      name: candidateName
    });
    if (merged.length >= maxResults) break;
  }

  return {
    candidates: merged,
    usedProviders
  };
}
