import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/admin/csv";

function pick(row: Record<string, string>, aliases: string[]): string {
  const lowered = Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.trim().toLowerCase()] = value;
    return acc;
  }, {});

  for (const alias of aliases) {
    const value = lowered[alias.toLowerCase()];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing CSV file" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (!rows.length) {
      return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const name = pick(row, ["name", "customer_name", "customer", "company", "company_name"]);
      if (!name) {
        skipped += 1;
        continue;
      }

      const rowId = pick(row, ["id", "customer_id"]);

      const data = {
        name,
        organization: pick(row, ["organization", "organisation", "legal_name"]) || undefined,
        industry: pick(row, ["industry", "segment", "category"]) || undefined,
        country: pick(row, ["country", "country_code", "land"]) || undefined,
        region: pick(row, ["region", "area"]) || undefined,
        seller: pick(row, ["seller", "owner", "sales_owner", "account_owner"]) || undefined,
        website: pick(row, ["website", "site", "url", "domain"]) || undefined,
        email: pick(row, ["email", "contact_email"]) || undefined,
        phone: pick(row, ["phone", "telephone", "mobile"]) || undefined,
        notes: pick(row, ["notes", "note", "comment"]) || undefined,
        potentialScore: (() => {
          const raw = pick(row, ["potentialscore", "potential_score", "potential", "score"]);
          return raw ? Math.max(0, Math.min(100, Number(raw) || 50)) : 50;
        })()
      };

      if (rowId) {
        try {
          await prisma.customer.update({
            where: { id: rowId },
            data
          });
          updated += 1;
          continue;
        } catch {
          // fallback to create when id is invalid
        }
      }

      await prisma.customer.create({ data });
      created += 1;
    }

    return NextResponse.json({ created, updated, skipped, total: rows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV import failed" },
      { status: 400 }
    );
  }
}
