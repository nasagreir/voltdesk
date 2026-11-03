import { promises as fs } from "node:fs";
import { getUsersFilePath } from "@/lib/auth/paths";

export function sessionPasswordMatches(
  tokenStamp: string | null | undefined,
  userStamp: string | null | undefined,
) {
  return (tokenStamp ?? "") === (userStamp ?? "");
}

interface StampUser {
  username?: string;
  passwordChangedAt?: string;
}

export async function passwordChangedAtFor(username: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(getUsersFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { users?: StampUser[] };
    const user = (parsed.users ?? []).find(
      (item) => item.username?.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!user) return null;
    return typeof user.passwordChangedAt === "string" ? user.passwordChangedAt : "";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}
