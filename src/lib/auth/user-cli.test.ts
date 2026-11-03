import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

const exec = promisify(execFile);
const script = path.join(process.cwd(), "scripts", "voltdesk-user.mjs");

async function run(dataDir: string, args: string[], password?: string) {
  return exec(process.execPath, [script, ...args], {
    env: {
      ...process.env,
      VOLTDESK_DATA_DIR: dataDir,
      ...(password ? { VOLTDESK_PASSWORD: password } : {}),
    },
  });
}

async function expectFail(dataDir: string, args: string[], password: string, pattern: RegExp) {
  try {
    await run(dataDir, args, password);
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? "");
    assert.match(stderr, pattern);
    return;
  }
  assert.fail(`${args.join(" ")} should have failed`);
}

describe("voltdesk-user", () => {
  it("creates a login and a reset signs that password out", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "voltdesk-user-"));
    try {
      const created = await run(dataDir, ["create", "ghull"], "driveway-42");
      assert.match(created.stdout, /Created user "ghull"/);
      const before = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8")) as {
        users: { username: string; passwordHash: string; passwordChangedAt: string }[];
      };
      assert.equal(before.users[0]?.username, "ghull");
      assert.equal(await bcrypt.compare("driveway-42", before.users[0].passwordHash), true);

      const reset = await run(dataDir, ["reset-password", "ghull"], "new-drive-99");
      assert.match(reset.stdout, /Password reset for "ghull"/);
      assert.match(reset.stdout, /signed out/);
      const after = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8")) as typeof before;
      assert.equal(await bcrypt.compare("new-drive-99", after.users[0].passwordHash), true);
      assert.notEqual(after.users[0].passwordChangedAt, before.users[0].passwordChangedAt);
      assert.equal(await bcrypt.compare("driveway-42", after.users[0].passwordHash), false);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("refuses a short password and an unknown account", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "voltdesk-user-"));
    try {
      await expectFail(dataDir, ["create", "ghull"], "short", /at least 8/);
      await run(dataDir, ["create", "ghull"], "driveway-42");
      await expectFail(dataDir, ["reset-password", "missing"], "driveway-42", /not found/);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
