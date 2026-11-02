import { connection, NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { createUser, userCount } from "@/lib/auth/users";

const bodySchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  await connection();
  try {
    if ((await userCount()) > 0) {
      return NextResponse.json(
        { error: "Setup is already finished. Sign in instead." },
        { status: 409 },
      );
    }
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Use a username of 3–32 characters and a password of at least 8." },
        { status: 400 },
      );
    }
    if (parsed.data.password !== parsed.data.confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }
    const username = await createUser(parsed.data.username, parsed.data.password);
    const token = await createSessionToken(username);
    const response = NextResponse.json({ ok: true, username });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not finish setup" },
      { status: 500 },
    );
  }
}
