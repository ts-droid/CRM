import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getPublicOrigin } from "@/lib/auth/url";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const publicOrigin = getPublicOrigin(url.origin);
  const response = NextResponse.redirect(new URL("/login", publicOrigin));
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
