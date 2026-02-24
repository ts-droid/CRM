import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCsv } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

const HEADERS = [
  "id",
  "name",
  "organization",
  "industry",
  "country",
  "region",
  "seller",
  "website",
  "email",
  "phone",
  "potentialScore",
  "notes"
];

export async function GET() {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" }
  });

  const csv = buildCsv(HEADERS, customers);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=vendora-customers.csv"
    }
  });
}
