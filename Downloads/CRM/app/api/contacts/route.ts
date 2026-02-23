import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const contacts = await prisma.contact.findMany({
    include: {
      customer: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json(contacts);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      role?: string;
      notes?: string;
      customerId?: string;
    };

    if (!body.firstName || !body.lastName || !body.customerId) {
      return NextResponse.json(
        { error: "firstName, lastName and customerId are required" },
        { status: 400 }
      );
    }

    const created = await prisma.contact.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        role: body.role,
        notes: body.notes,
        customerId: body.customerId
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
