import { NextResponse } from "next/server";
import { isAdminEmail, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

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

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = readSessionToken(cookieHeader);

  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });

  const session = await verifySession(token);
  if (!session?.email) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({
    authenticated: true,
    isAdmin: isAdminEmail(session.email),
    email: session.email,
    name: session.name || null,
    picture: session.picture || null
  });
}
