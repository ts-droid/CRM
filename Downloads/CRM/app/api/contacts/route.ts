import { NextResponse } from "next/server";
import { ActivityType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET() {
  try {
    const contacts = await prisma.contact.findMany({
      include: {
        customer: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return NextResponse.json(contacts);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      department?: string;
      title?: string;
      role?: string;
      notes?: string;
      customerId?: string;
    };

    const normalizedName = body.name?.trim();
    const nameParts = normalizedName ? normalizedName.split(/\s+/).filter(Boolean) : [];
    const inferredFirstName = nameParts[0];
    const inferredLastName = nameParts.slice(1).join(" ");

    const firstName = body.firstName?.trim() || inferredFirstName;
    const lastName = body.lastName?.trim() || inferredLastName || "-";

    if (!firstName || !body.customerId) {
      return NextResponse.json(
        { error: "name/firstName and customerId are required" },
        { status: 400 }
      );
    }

    const title = body.title?.trim() || body.role?.trim() || null;

    const created = await prisma.contact.create({
      data: {
        firstName,
        lastName,
        email: body.email,
        phone: body.phone,
        department: body.department,
        title,
        role: title,
        notes: body.notes,
        customerId: body.customerId
      }
    });

    await logActivity({
      type: ActivityType.CONTACT_CREATED,
      message: `Contact added: ${created.firstName} ${created.lastName}`,
      customerId: created.customerId,
      contactId: created.id,
      metadata: {
        department: created.department,
        title: created.title
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
