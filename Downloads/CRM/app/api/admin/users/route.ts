import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const usersRaw = await prisma.userProfile.findMany({
    orderBy: [{ lastLoginAt: "desc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      slackMemberId: true,
      lastLoginAt: true,
      updatedAt: true
    }
  });

  const users = usersRaw.map((user) => ({
    ...user,
    isAdmin: isAdminEmail(user.email)
  }));

  return NextResponse.json({ users });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; slackMemberId?: string | null };
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    const slackMemberId = String(body.slackMemberId || "").trim();
    const user = await prisma.userProfile.update({
      where: { id },
      data: { slackMemberId: slackMemberId || null },
      select: {
        id: true,
        email: true,
        name: true,
        slackMemberId: true,
        lastLoginAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      user: {
        ...user,
        isAdmin: isAdminEmail(user.email)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 400 }
    );
  }
}
