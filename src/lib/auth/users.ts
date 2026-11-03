import { promises as fs } from "node:fs";
import bcrypt from "bcryptjs";
import { getDataDir, getUsersFilePath } from "@/lib/auth/paths";

export interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt?: string;
}

interface UsersFile {
  users: StoredUser[];
}

async function readUsersFile(): Promise<UsersFile> {
  await fs.mkdir(getDataDir(), { recursive: true });
  try {
    const raw = await fs.readFile(getUsersFilePath(), "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { users: [] };
    throw error;
  }
}

async function writeUsersFile(data: UsersFile) {
  await fs.mkdir(getDataDir(), { recursive: true });
  const file = getUsersFilePath();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
}

export async function userCount(): Promise<number> {
  const { users } = await readUsersFile();
  return users.length;
}

export async function findUser(username: string): Promise<StoredUser | undefined> {
  const { users } = await readUsersFile();
  return users.find((user) => user.username.toLowerCase() === username.trim().toLowerCase());
}

export async function createUser(username: string, password: string) {
  const trimmed = username.trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(trimmed)) {
    throw new Error("Username must be 3–32 chars (letters, numbers, . _ -)");
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const data = await readUsersFile();
  if (data.users.some((user) => user.username.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`User "${trimmed}" already exists`);
  }
  const now = new Date().toISOString();
  const user: StoredUser = {
    username: trimmed,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
  };
  data.users.push(user);
  await writeUsersFile(data);
  return user;
}

export async function verifyUser(username: string, password: string) {
  const user = await findUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
