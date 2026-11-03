import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { runAsUser } from "@/lib/auth/actor";
import { userForBotToken } from "@/lib/bot-auth";
import { createUser } from "@/lib/auth/users";
import { getSettings, saveSettings } from "@/lib/settings";

const previousData = process.env.VOLTDESK_DATA_DIR;
const previousClient = process.env.TESLA_CLIENT_ID;
const previousRefresh = process.env.TESLA_REFRESH_TOKEN;

let dataDir = "";

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "voltdesk-accounts-"));
  process.env.VOLTDESK_DATA_DIR = dataDir;
  delete process.env.TESLA_CLIENT_ID;
  delete process.env.TESLA_REFRESH_TOKEN;
});

after(async () => {
  if (previousData == null) delete process.env.VOLTDESK_DATA_DIR;
  else process.env.VOLTDESK_DATA_DIR = previousData;
  if (previousClient == null) delete process.env.TESLA_CLIENT_ID;
  else process.env.TESLA_CLIENT_ID = previousClient;
  if (previousRefresh == null) delete process.env.TESLA_REFRESH_TOKEN;
  else process.env.TESLA_REFRESH_TOKEN = previousRefresh;
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

describe("separate Tesla logins", () => {
  it("gives the first login the old files and keeps the next login's Fleet API separate", async () => {
    await writeFile(
      path.join(dataDir, "settings.json"),
      `${JSON.stringify({
        teslaClientId: "owner-app",
        teslaRefreshToken: "owner-refresh",
        apiTokens: [{ id: "ownerbot", name: "Owner", token: "vd_owner_token_123456", createdAt: "" }],
      })}\n`,
      { mode: 0o600 },
    );
    await createUser("owner", "driveway-42");
    await createUser("ada", "harbor-4242");

    const owner = await runAsUser("owner", () => getSettings());
    assert.equal(owner.teslaClientId, "owner-app");
    assert.equal(owner.teslaRefreshToken, "owner-refresh");
    const moved = JSON.parse(await readFile(path.join(dataDir, "users", "owner", "settings.json"), "utf8")) as {
      teslaClientId: string;
    };
    assert.equal(moved.teslaClientId, "owner-app");
    await assert.rejects(readFile(path.join(dataDir, "settings.json"), "utf8"));

    process.env.TESLA_CLIENT_ID = "from-the-container";
    process.env.TESLA_REFRESH_TOKEN = "from-the-container-token";
    const second = await runAsUser("ada", () => getSettings());
    assert.equal(second.teslaClientId, "");
    assert.equal(second.teslaRefreshToken, "");
    const ownerAgain = await runAsUser("owner", () => getSettings());
    assert.equal(ownerAgain.teslaClientId, "owner-app");

    await runAsUser("ada", () =>
      saveSettings({
        ...second,
        teslaClientId: "ada-app",
        teslaRefreshToken: "ada-refresh",
        apiTokens: [{ id: "adabot", name: "Ada", token: "vd_ada_token_12345678", createdAt: "" }],
      }),
    );
    assert.equal((await runAsUser("owner", () => getSettings())).teslaClientId, "owner-app");
    assert.equal((await runAsUser("ada", () => getSettings())).teslaClientId, "ada-app");
    assert.equal(await userForBotToken("vd_owner_token_123456"), "owner");
    assert.equal(await userForBotToken("vd_ada_token_12345678"), "ada");
    assert.equal(await userForBotToken("vd_missing_token_123456"), null);
  });
});
