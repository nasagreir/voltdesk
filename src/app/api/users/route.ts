import { headers } from "next/headers";
import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { createUser, listUsers } from "@/lib/auth/users";

const bodySchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(8).max(200),
});

export async function GET() {
  await connection();
  const you = (await headers()).get("x-voltdesk-user")?.toLowerCase() ?? "";
  const users = await listUsers();
  return NextResponse.json({
    users: users
      .map((user) => ({
        username: user.username,
        you: user.username.toLowerCase() === you,
      }))
      .sort((a, b) => Number(b.you) - Number(a.you) || a.username.localeCompare(b.username)),
  });
}

export async function POST(request: Request) {
  await connection();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Username is 3–32 characters. Password is at least 8." },
      { status: 400 },
    );
  }
  try {
    const user = await createUser(parsed.data.username, parsed.data.password);
    return NextResponse.json({ username: user.username }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add that person." },
      { status: 400 },
    );
  }
}
