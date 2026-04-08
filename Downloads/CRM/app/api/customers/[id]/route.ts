import { NextResponse } from "next/server";
import { ActivityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

function readSessionToken(cookieHeader: string): string | null {
  const cookiePart = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!cookiePart) return null;
  const raw = cookiePart.slice(`${SESSION_COOKIE}=`.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  let customer:
    | (Awaited<ReturnType<typeof prisma.customer.findUnique>> & {
        contacts?: unknown[];
        plans?: unknown[];
      })
    | null = null;

  try {
    customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        contacts: true,
        plans: true
      }
    });
  } catch {
    customer = await prisma.customer.findUnique({
      where: { id: params.id }
    });

    if (customer) {
      customer = { ...customer, contacts: [], plans: [] };
    }
  }

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json(customer);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const token = readSessionToken(cookieHeader);
    const session = token ? await verifySession(token) : null;

    const body = (await req.json()) as {
      name?: string;
      registrationNumber?: string;
      industry?: string;
      country?: string;
      region?: string;
      seller?: string;
      address?: string;
      website?: string;
      email?: string;
      phone?: string;
      notes?: string;
      potentialScore?: number;
      manualBrandRevenue?: Array<{ brand: string; revenue: number; currency: string; year: number }>;
    };

    // Merge manualBrandRevenue into existing webshopSignals to preserve research data
    let webshopSignalsUpdate: Record<string, unknown> | undefined;
    if (Array.isArray(body.manualBrandRevenue)) {
      const existing = await prisma.customer.findUnique({
        where: { id: params.id },
        select: { webshopSignals: true }
      });
      const currentSignals =
        existing?.webshopSignals && typeof existing.webshopSignals === "object"
          ? (existing.webshopSignals as Record<string, unknown>)
          : {};
      const validated = body.manualBrandRevenue
        .filter((row) => typeof row.brand === "string" && row.brand.trim() && Number.isFinite(row.revenue) && row.revenue >= 0)
        .map((row) => ({
          brand: row.brand.trim(),
          revenue: row.revenue,
          currency: (typeof row.currency === "string" ? row.currency.trim().toUpperCase() : "") || "SEK",
          year: Number.isFinite(row.year) ? Math.round(row.year) : new Date().getUTCFullYear()
        }));
      webshopSignalsUpdate = { ...currentSignals, manualBrandRevenue: validated };
    }

    const updated = await prisma.customer.update({
      where: { id: params.id },
      data: {
        name: body.name,
        registrationNumber: body.registrationNumber,
        industry: body.industry,
        country: body.country,
        region: body.region,
        seller: body.seller,
        address: body.address,
        website: body.website,
        email: body.email,
        phone: body.phone,
        notes: body.notes,
        potentialScore:
          typeof body.potentialScore === "number"
            ? Math.max(0, Math.min(100, Math.round(body.potentialScore)))
            : undefined,
        ...(webshopSignalsUpdate ? { webshopSignals: webshopSignalsUpdate as Parameters<typeof prisma.customer.update>[0]["data"]["webshopSignals"] } : {})
      }
    });

    await logActivity({
      type: ActivityType.CUSTOMER_UPDATED,
      message: `Customer updated: ${updated.name}`,
      customerId: updated.id,
      actorName: session?.email || undefined,
      metadata: {
        potentialScore: updated.potentialScore,
        seller: updated.seller,
        country: updated.country
      }
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        webshopSignals: true,
        _count: { select: { salesRecords: true } }
      }
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const signals = customer.webshopSignals && typeof customer.webshopSignals === "object"
      ? (customer.webshopSignals as Record<string, unknown>)
      : {};
    const researchHistory = Array.isArray(signals.researchHistory) ? signals.researchHistory : [];

    if (researchHistory.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete customer with research data. Remove research first." },
        { status: 400 }
      );
    }

    if (customer._count.salesRecords > 0) {
      return NextResponse.json(
        { error: "Cannot delete customer with sales records." },
        { status: 400 }
      );
    }

    await prisma.customer.delete({ where: { id: params.id } });

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
