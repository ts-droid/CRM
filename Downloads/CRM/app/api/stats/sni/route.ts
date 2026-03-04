import { NextResponse } from "next/server";
import { getPxWebConfig, isPxWebConfigured, lookupSniStatistics } from "@/lib/stats/pxweb";

export const dynamic = "force-dynamic";

function parseCodes(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const codes = parseCodes(url.searchParams.get("codes") ?? url.searchParams.get("sni"));
  const region = url.searchParams.get("region");
  const time = url.searchParams.get("time");
  const contentCode = url.searchParams.get("contentCode");
  const maxRows = Number(url.searchParams.get("maxRows") || 200);

  try {
    const config = await getPxWebConfig();
    if (!isPxWebConfigured(config)) {
      return NextResponse.json(
        {
          error: "PxWeb not configured",
          configured: false,
          configHint: {
            required: ["pxwebBaseUrl", "pxwebSniTablePath"],
            current: config
          }
        },
        { status: 400 }
      );
    }

    if (codes.length === 0) {
      return NextResponse.json(
        {
          error: "Missing SNI code. Use query param 'codes' or 'sni', e.g. /api/stats/sni?codes=47430",
          configured: true
        },
        { status: 400 }
      );
    }

    const result = await lookupSniStatistics({
      sniCodes: codes,
      region,
      time,
      contentCode,
      maxRows: Number.isFinite(maxRows) ? Math.max(1, Math.min(2000, Math.round(maxRows))) : 200
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load SNI statistics"
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sniCodes?: string[] | string;
      region?: string | null;
      time?: string | null;
      contentCode?: string | null;
      maxRows?: number;
    };
    const rawCodes = Array.isArray(body.sniCodes) ? body.sniCodes.join(" ") : String(body.sniCodes ?? "");
    const sniCodes = parseCodes(rawCodes);
    if (sniCodes.length === 0) {
      return NextResponse.json({ error: "sniCodes is required" }, { status: 400 });
    }

    const result = await lookupSniStatistics({
      sniCodes,
      region: body.region ?? null,
      time: body.time ?? null,
      contentCode: body.contentCode ?? null,
      maxRows: Number.isFinite(Number(body.maxRows)) ? Math.max(1, Math.min(2000, Math.round(Number(body.maxRows)))) : 200
    });

    if (!result.configured) {
      return NextResponse.json(
        {
          error: "PxWeb not configured",
          configured: false,
          configHint: {
            required: ["pxwebBaseUrl", "pxwebSniTablePath"],
            current: result.config
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load SNI statistics" },
      { status: 500 }
    );
  }
}

