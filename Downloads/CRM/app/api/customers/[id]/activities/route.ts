import { ActivityType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

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

    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      ?.split("=")[1];
    const session = token ? await verifySession(token) : null;
    const actorName = session?.email || body.actorName?.trim() || undefined;

    const created = await prisma.activity.create({
      data: {
        type: ActivityType.NOTE,
        message: body.message.trim(),
        customerId: params.id,
        actorName
      }
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
