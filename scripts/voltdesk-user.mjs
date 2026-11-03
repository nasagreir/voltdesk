#!/usr/bin/env node
/**
 * VoltDesk user CLI — create accounts and recover passwords from the LXC shell.
 *
 * Usage:
 *   voltdesk-user list
 *   voltdesk-user create <username> [password]
 *   voltdesk-user reset-password <username> [password]
 *   voltdesk-user path
 *
 * Env:
 *   VOLTDESK_DATA_DIR  (default: <app>/data or /opt/voltdesk/data)
 */
import { stdin as input, stdout as output } from "node:process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function resolveDataDir() {
  if (process.env.VOLTDESK_DATA_DIR) return process.env.VOLTDESK_DATA_DIR;
  return path.join(APP_ROOT, "data");
}

const DATA_DIR = resolveDataDir();
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function loadBcrypt() {
  try {
    return require(path.join(APP_ROOT, "node_modules", "bcryptjs"));
  } catch {
    return require("bcryptjs");
  }
}

async function readUsers() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if (error && error.code === "ENOENT") return { users: [] };
    throw error;
  }
}

async function writeUsers(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${USERS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, USERS_FILE);
  try {
    await fs.chmod(USERS_FILE, 0o600);
  } catch {
    /* ignore */
  }
  await ownDataForAppUser();
}

async function promptHidden(label) {
  if (!input.isTTY) {
    throw new Error("Password prompt requires an interactive TTY. Set VOLTDESK_PASSWORD for a script.");
  }
  output.write(label);
  let skipEscape = false;
  const chars = [];
  input.setRawMode(true);
  input.resume();
  try {
    return await new Promise((resolve, reject) => {
      const onData = (buf) => {
        const text = buf.toString("utf8");
        for (const ch of text) {
          if (skipEscape) {
            if (/[A-Za-z~]/.test(ch)) skipEscape = false;
            continue;
          }
          if (ch === "\u0003") {
            cleanup();
            output.write("\n");
            reject(new Error("Canceled"));
            return;
          }
          if (ch === "\n" || ch === "\r") {
            cleanup();
            output.write("\n");
            resolve(chars.join(""));
            return;
          }
          if (ch === "\u007f" || ch === "\b") {
            chars.pop();
            continue;
          }
          if (ch === "\u001b") {
            skipEscape = true;
            continue;
          }
          if (ch < " ") continue;
          chars.push(ch);
        }
      };
      function cleanup() {
        input.off("data", onData);
      }
      input.on("data", onData);
    });
  } finally {
    if (input.isTTY) input.setRawMode(false);
    input.pause();
  }
}

async function choosePassword(passwordArg) {
  if (passwordArg) {
    console.error("That password was visible on the command line. Prefer a blank prompt or VOLTDESK_PASSWORD.");
    return { password: passwordArg, generated: false };
  }
  if (process.env.VOLTDESK_PASSWORD) {
    return { password: process.env.VOLTDESK_PASSWORD, generated: false };
  }
  if (input.isTTY) {
    const first = await promptHidden("New password (Enter to generate one): ");
    if (!first) {
      return { password: generatePassword(), generated: true };
    }
    const second = await promptHidden("Confirm password: ");
    if (first !== second) throw new Error("Those passwords did not match.");
    return { password: first, generated: false };
  }
  return { password: generatePassword(), generated: true };
}

function generatePassword() {
  return randomBytes(12).toString("base64url");
}

function usage() {
  console.log(`VoltDesk user admin

Usage:
  voltdesk-user list
  voltdesk-user create USERNAME [password]
  voltdesk-user reset-password USERNAME [password]
  voltdesk-user path

The prompt does not echo the password. Press Enter to generate one.
A reset signs browsers out of that account.
Do not type angle brackets. Those are shell redirection, not part of the name.
A password typed on the command line is visible in the shell history. For a script, set VOLTDESK_PASSWORD.

Examples:
  voltdesk-user list
  voltdesk-user create ghull
  voltdesk-user reset-password ghull
`);
}

function normalizeUsername(raw) {
  if (raw == null || raw === "") return "";
  const trimmed = String(raw).trim();
  if (trimmed.includes("<") || trimmed.includes(">")) {
    const inner = trimmed.replace(/[<>]/g, "");
    console.error(
      "Do not include angle brackets. The shell treats <name> as a redirect.",
    );
    console.error(
      `Example: voltdesk-user reset-password ${inner || "ghull"}`,
    );
    if (/^[a-zA-Z0-9._-]{3,32}$/.test(inner)) {
      console.error(`Continuing with username "${inner}".`);
      return inner;
    }
    process.exit(1);
  }
  return trimmed;
}

async function ownDataForAppUser() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) return;
  const appUser = process.env.VOLTDESK_APP_USER || "voltdesk";
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  try {
    await execFileAsync("id", [appUser]);
    await execFileAsync("chown", ["-R", `${appUser}:${appUser}`, DATA_DIR]);
  } catch {
    /* app user may not exist in local dev */
  }
}

async function cmdList() {
  const { users } = await readUsers();
  if (users.length === 0) {
    console.log("No users yet. Create one with: voltdesk-user create admin");
    return;
  }
  for (const u of users) {
    console.log(`${u.username}\tcreated ${u.createdAt}\tupdated ${u.updatedAt}`);
  }
}

async function cmdCreate(username, passwordArg) {
  username = normalizeUsername(username);
  if (!username) {
    usage();
    process.exit(1);
  }
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3–32 chars (letters, numbers, . _ -)");
  }
  const bcrypt = await loadBcrypt();
  const data = await readUsers();
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error(`User "${username}" already exists`);
  }
  const chosen = await choosePassword(passwordArg);
  const password = chosen.password;
  const generated = chosen.generated;
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const now = new Date().toISOString();
  data.users.push({
    username,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
  });
  await writeUsers(data);
  console.log(`Created user "${username}"`);
  if (generated) console.log(`Generated password: ${password}`);
  console.log(`Store: ${USERS_FILE}`);
}

async function cmdReset(username, passwordArg) {
  username = normalizeUsername(username);
  if (!username) {
    usage();
    process.exit(1);
  }
  const bcrypt = await loadBcrypt();
  const data = await readUsers();
  const idx = data.users.findIndex(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (idx < 0) throw new Error(`User "${username}" not found`);

  const chosen = await choosePassword(passwordArg);
  const password = chosen.password;
  const generated = chosen.generated;
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  const now = new Date().toISOString();

  data.users[idx] = {
    ...data.users[idx],
    passwordHash: await bcrypt.hash(password, 12),
    updatedAt: now,
    passwordChangedAt: now,
  };
  await writeUsers(data);
  console.log(`Password reset for "${data.users[idx].username}"`);
  console.log("Existing browser sessions for that account are signed out.");
  if (generated) console.log(`Generated password: ${password}`);
  console.log(`Store: ${USERS_FILE}`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case "list":
        await cmdList();
        break;
      case "create":
        await cmdCreate(args[0], args[1]);
        break;
      case "reset-password":
      case "reset":
        await cmdReset(args[0], args[1]);
        break;
      case "path":
        console.log(USERS_FILE);
        // also mention opt path for ops docs
        console.log(`DATA_DIR=${DATA_DIR}`);
        break;
      case "help":
      case undefined:
        usage();
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        usage();
        process.exit(1);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
