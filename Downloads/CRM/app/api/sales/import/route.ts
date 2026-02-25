import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ImportRow = {
  customerId?: string;
  customerName?: string;
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { rows?: ImportRow[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      return NextResponse.json({ error: "rows is required" }, { status: 400 });
    }

    const result = {
      total: rows.length,
      upserted: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const source = String(row.source || "api").trim().toLowerCase() || "api";
      const periodStart = row.periodStart ? new Date(row.periodStart) : null;
      const periodEnd = row.periodEnd ? new Date(row.periodEnd) : null;

      if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
        result.skipped += 1;
        result.errors.push(`Row ${index + 1}: invalid periodStart/periodEnd`);
        continue;
      }

      let customerId = row.customerId?.trim() || "";
      if (!customerId && row.customerName?.trim()) {
        const customer = await prisma.customer.findFirst({
          where: { name: row.customerName.trim() },
          select: { id: true }
        });
        customerId = customer?.id || "";
      }

      if (!customerId) {
        result.skipped += 1;
        result.errors.push(`Row ${index + 1}: customerId or customerName match is required`);
        continue;
      }

      const customerExists = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true }
      });
      if (!customerExists) {
        result.skipped += 1;
        result.errors.push(`Row ${index + 1}: customer not found (${customerId})`);
        continue;
      }

      await prisma.salesRecord.upsert({
        where: {
          customerId_source_periodStart_periodEnd: {
            customerId,
            source,
            periodStart,
            periodEnd
          }
        },
        update: {
          externalCustomerRef: row.externalCustomerRef?.trim() || null,
          currency: (row.currency || "SEK").trim().toUpperCase(),
          netSales: typeof row.netSales === "number" ? row.netSales : null,
          grossMargin: typeof row.grossMargin === "number" ? row.grossMargin : null,
          unitsSold: typeof row.unitsSold === "number" ? Math.round(row.unitsSold) : null,
          ordersCount: typeof row.ordersCount === "number" ? Math.round(row.ordersCount) : null,
          metadata: row.metadata === undefined ? undefined : (row.metadata as object)
        },
        create: {
          customerId,
          source,
          externalCustomerRef: row.externalCustomerRef?.trim() || null,
          periodStart,
          periodEnd,
          currency: (row.currency || "SEK").trim().toUpperCase(),
          netSales: typeof row.netSales === "number" ? row.netSales : null,
          grossMargin: typeof row.grossMargin === "number" ? row.grossMargin : null,
          unitsSold: typeof row.unitsSold === "number" ? Math.round(row.unitsSold) : null,
          ordersCount: typeof row.ordersCount === "number" ? Math.round(row.ordersCount) : null,
          metadata: row.metadata === undefined ? undefined : (row.metadata as object)
        }
      });

      result.upserted += 1;
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
