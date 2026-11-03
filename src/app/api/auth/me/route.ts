import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { passwordChangedAtFor, sessionPasswordMatches } from "@/lib/auth/password-stamp";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { userCount } from "@/lib/auth/users";

export async function GET() {
  await connection();
  const count = await userCount();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const verified = token ? await verifySessionToken(token) : null;
  const stamp = verified ? await passwordChangedAtFor(verified.username) : null;
  const session =
    verified && stamp != null && sessionPasswordMatches(verified.pwd, stamp) ? verified : null;
  return NextResponse.json({
    authenticated: Boolean(session),
    username: session?.username ?? null,
    userCount: count,
    needsSetup: count === 0,
  });
}
