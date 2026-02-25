import { NextResponse } from "next/server";
import { ActivityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

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
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")[1];
    const session = token ? await verifySession(token) : null;

    const body = (await req.json()) as {
      name?: string;
      organization?: string;
      industry?: string;
      country?: string;
      region?: string;
      seller?: string;
      website?: string;
      email?: string;
      phone?: string;
      notes?: string;
      potentialScore?: number;
    };

    const updated = await prisma.customer.update({
      where: { id: params.id },
      data: {
        name: body.name,
        organization: body.organization,
        industry: body.industry,
        country: body.country,
        region: body.region,
        seller: body.seller,
        website: body.website,
        email: body.email,
        phone: body.phone,
        notes: body.notes,
        potentialScore:
          typeof body.potentialScore === "number"
            ? Math.max(0, Math.min(100, Math.round(body.potentialScore)))
            : undefined
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
