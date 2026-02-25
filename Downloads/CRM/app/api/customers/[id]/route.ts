import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
