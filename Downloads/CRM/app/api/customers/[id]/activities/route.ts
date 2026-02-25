import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const activities = await prisma.activity.findMany({
    where: { customerId: params.id },
    include: {
      plan: {
        select: { id: true, title: true }
      },
      contact: {
        select: { id: true, firstName: true, lastName: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json(activities);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await req.json()) as { message?: string; actorName?: string };
    if (!body.message || !body.message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    await logActivity({
      type: ActivityType.NOTE,
      message: body.message.trim(),
      customerId: params.id,
      actorName: body.actorName?.trim() || undefined
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
