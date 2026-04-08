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

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      department?: string;
      title?: string;
      notes?: string;
    };

    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Contact id is required" }, { status: 400 });
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(body.firstName !== undefined ? { firstName: body.firstName.trim() } : {}),
        ...(body.lastName !== undefined ? { lastName: body.lastName.trim() } : {}),
        ...(body.email !== undefined ? { email: body.email.trim() || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
        ...(body.department !== undefined ? { department: body.department.trim() || null } : {}),
        ...(body.title !== undefined ? { title: body.title.trim() || null, role: body.title.trim() || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes.trim() || null } : {})
      }
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update contact" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Contact id is required" }, { status: 400 });
    }

    await prisma.contact.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 400 });
  }
}
