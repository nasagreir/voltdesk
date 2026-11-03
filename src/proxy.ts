import { NextResponse, type NextRequest } from "next/server";
import { passwordChangedAtFor, sessionPasswordMatches } from "@/lib/auth/password-stamp";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth/login",
  "/api/auth/setup",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/v1",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|jpe?g|svg|webp|gif|txt|xml|webmanifest)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const verified = token ? await verifySessionToken(token) : null;
  const stamp = verified ? await passwordChangedAtFor(verified.username) : null;
  const session =
    verified && stamp != null && sessionPasswordMatches(verified.pwd, stamp) ? verified : null;

  if (!session && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (session && (pathname === "/login" || pathname === "/setup")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-voltdesk-user");
  if (session) requestHeaders.set("x-voltdesk-user", session.username);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
