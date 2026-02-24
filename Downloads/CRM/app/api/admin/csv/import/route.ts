import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/admin/csv";

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

    for (const row of rows) {
      const name = row.name?.trim();
      if (!name) continue;

      const data = {
        name,
        organization: row.organization || undefined,
        industry: row.industry || undefined,
        country: row.country || undefined,
        region: row.region || undefined,
        seller: row.seller || undefined,
        website: row.website || undefined,
        email: row.email || undefined,
        phone: row.phone || undefined,
        notes: row.notes || undefined,
        potentialScore: row.potentialScore ? Math.max(0, Math.min(100, Number(row.potentialScore) || 50)) : 50
      };

      if (row.id) {
        try {
          await prisma.customer.update({
            where: { id: row.id },
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

    return NextResponse.json({ created, updated, total: rows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CSV import failed" },
      { status: 400 }
    );
  }
}
