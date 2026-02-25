import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/google", "/api/auth/google/callback", "/api/auth/logout", "/api/auth/me"];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/vendora-logo.svg")) return true;
  return PUBLIC_PATHS.some((path) => pathname === path);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (session?.email) {
    const adminPath = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
    if (!adminPath) return NextResponse.next();

    if (isAdminEmail(session.email)) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const deniedUrl = req.nextUrl.clone();
    deniedUrl.pathname = "/";
    deniedUrl.searchParams.set("error", "admin_required");
    return NextResponse.redirect(deniedUrl);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"]
};
