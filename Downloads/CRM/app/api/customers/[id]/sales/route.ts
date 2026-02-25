import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));
  const limitRaw = Number(searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.round(limitRaw))) : 50;

  const rows = await prisma.salesRecord.findMany({
    where: {
      customerId: params.id,
      ...(from || to
        ? {
            periodStart: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {})
            }
          }
        : {})
    },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  const aggregate = rows.reduce(
    (acc, row) => {
      acc.netSales += row.netSales ?? 0;
      acc.unitsSold += row.unitsSold ?? 0;
      acc.ordersCount += row.ordersCount ?? 0;
      if (typeof row.grossMargin === "number") {
        acc.marginSamples += 1;
        acc.grossMargin += row.grossMargin;
      }
      return acc;
    },
    { netSales: 0, unitsSold: 0, ordersCount: 0, grossMargin: 0, marginSamples: 0 }
  );

  return NextResponse.json({
    customerId: params.id,
    count: rows.length,
    totals: {
      netSales: Number(aggregate.netSales.toFixed(2)),
      unitsSold: aggregate.unitsSold,
      ordersCount: aggregate.ordersCount,
      averageGrossMargin:
        aggregate.marginSamples > 0 ? Number((aggregate.grossMargin / aggregate.marginSamples).toFixed(2)) : null
    },
    rows
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as {
      source?: string;
      externalCustomerRef?: string;
      periodStart?: string;
      periodEnd?: string;
      currency?: string;
      netSales?: number;
      grossMargin?: number;
      unitsSold?: number;
      ordersCount?: number;
      metadata?: unknown;
    };

    if (!body.periodStart || !body.periodEnd) {
      return NextResponse.json({ error: "periodStart and periodEnd are required" }, { status: 400 });
    }

    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: "Invalid period dates" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const source = String(body.source || "manual").trim().toLowerCase() || "manual";
    const created = await prisma.salesRecord.upsert({
      where: {
        customerId_source_periodStart_periodEnd: {
          customerId: params.id,
          source,
          periodStart,
          periodEnd
        }
      },
      update: {
        externalCustomerRef: body.externalCustomerRef?.trim() || null,
        currency: (body.currency || "SEK").trim().toUpperCase(),
        netSales: typeof body.netSales === "number" ? body.netSales : null,
        grossMargin: typeof body.grossMargin === "number" ? body.grossMargin : null,
        unitsSold: typeof body.unitsSold === "number" ? Math.round(body.unitsSold) : null,
        ordersCount: typeof body.ordersCount === "number" ? Math.round(body.ordersCount) : null,
        metadata: body.metadata === undefined ? undefined : (body.metadata as object)
      },
      create: {
        customerId: params.id,
        source,
        externalCustomerRef: body.externalCustomerRef?.trim() || null,
        periodStart,
        periodEnd,
        currency: (body.currency || "SEK").trim().toUpperCase(),
        netSales: typeof body.netSales === "number" ? body.netSales : null,
        grossMargin: typeof body.grossMargin === "number" ? body.grossMargin : null,
        unitsSold: typeof body.unitsSold === "number" ? Math.round(body.unitsSold) : null,
        ordersCount: typeof body.ordersCount === "number" ? Math.round(body.ordersCount) : null,
        metadata: body.metadata === undefined ? undefined : (body.metadata as object)
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
