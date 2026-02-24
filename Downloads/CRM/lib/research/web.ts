export type WebsiteSnapshot = {
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  textSample: string;
  vendoraFitScore: number;
};

function pick(input: string, pattern: RegExp): string | null {
  const match = input.match(pattern);
  if (!match?.[1]) return null;
  return match[1].replace(/\s+/g, " ").trim();
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function computeVendoraFitScore(text: string): number {
  const normalized = text.toLowerCase();
  const keywords = [
    "accessories",
    "electronics",
    "retail",
    "reseller",
    "distribution",
    "consumer tech",
    "b2b",
    "enterprise",
    "nordic",
    "scandinavia",
    "mobile",
    "smart home",
    "audio"
  ];

  const hits = keywords.filter((keyword) => normalized.includes(keyword)).length;
  return Math.max(20, Math.min(100, 35 + hits * 6));
}

export async function fetchWebsiteSnapshot(inputUrl: string): Promise<WebsiteSnapshot> {
  const url = normalizeUrl(inputUrl);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "VendoraCRM-Research/1.0 (+https://vendora.se)"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  const html = await response.text();
  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(html, /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
  const h1 = pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);

  const textSample = `${title ?? ""} ${description ?? ""} ${h1 ?? ""} ${html.slice(0, 5000)}`
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    url,
    title,
    description,
    h1,
    textSample: textSample.slice(0, 1200),
    vendoraFitScore: computeVendoraFitScore(textSample)
  };
}
