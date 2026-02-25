export function getPublicOrigin(fallbackOrigin: string): string {
  const appUrl = (process.env.APP_URL || "").trim();
  if (appUrl) {
    try {
      return new URL(appUrl).origin;
    } catch {
      // ignore invalid APP_URL
    }
  }

  const railwayDomain = (process.env.RAILWAY_PUBLIC_DOMAIN || "").trim();
  if (railwayDomain) {
    return `https://${railwayDomain}`;
  }

  return fallbackOrigin;
}
