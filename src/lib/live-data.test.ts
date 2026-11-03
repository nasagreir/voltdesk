import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLiveData, liveDataUntilFrom, pollSeconds } from "./live-data";

const NOW = Date.parse("2026-11-03T13:00:00.000Z");

describe("live data window", () => {
  it("stays off unless a future end time is set", () => {
    assert.equal(isLiveData(null, NOW), false);
    assert.equal(isLiveData("", NOW), false);
    assert.equal(isLiveData("not-a-date", NOW), false);
    assert.equal(isLiveData("2026-11-03T12:59:00.000Z", NOW), false);
    assert.equal(isLiveData("2026-11-03T13:30:00.000Z", NOW), true);
  });

  it("asks for a fresh report every 15 seconds only while live data is on", () => {
    assert.equal(pollSeconds(["parked"], 60, false), 60);
    assert.equal(pollSeconds(["asleep"], 60, false), 60);
    assert.equal(pollSeconds(["driving"], 60, false), 15);
    assert.equal(pollSeconds(["parked"], 60, true), 15);
    const until = liveDataUntilFrom(NOW);
    assert.equal(Date.parse(until) - NOW, 30 * 60 * 1000);
  });
});
