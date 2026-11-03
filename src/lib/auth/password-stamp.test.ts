import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNextPath } from "./next-path";
import { sessionPasswordMatches } from "./password-stamp";

describe("login return path", () => {
  it("keeps an in-app path and drops an off-site one", () => {
    assert.equal(safeNextPath("/trips/demo-1"), "/trips/demo-1");
    assert.equal(safeNextPath("/maintenance?vehicle=demo"), "/maintenance?vehicle=demo");
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("/login"), "/");
    assert.equal(safeNextPath("/setup"), "/");
    assert.equal(safeNextPath(null), "/");
  });
});

describe("password stamp", () => {
  it("accepts a session from before passwords were stamped", () => {
    assert.equal(sessionPasswordMatches("", ""), true);
    assert.equal(sessionPasswordMatches(undefined, undefined), true);
  });

  it("rejects a session from before the password was reset", () => {
    assert.equal(sessionPasswordMatches("", "2026-11-03T12:00:00.000Z"), false);
    assert.equal(sessionPasswordMatches("2026-11-03T11:00:00.000Z", "2026-11-03T12:00:00.000Z"), false);
    assert.equal(sessionPasswordMatches("2026-11-03T12:00:00.000Z", "2026-11-03T12:00:00.000Z"), true);
  });
});
