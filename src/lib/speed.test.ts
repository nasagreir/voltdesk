import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { speedOverDrives } from "./speed";

describe("speed over drives", () => {
  it("uses the fastest drive as the high and miles over hours as the average", () => {
    const stats = speedOverDrives([
      { distanceMi: 30, durationMin: 60, maxSpeedMph: 55 },
      { distanceMi: 10, durationMin: 30, maxSpeedMph: 72 },
    ]);
    assert.equal(stats.maxSpeedMph, 72);
    assert.equal(stats.avgSpeedMph, 40 / 1.5);
    assert.equal(stats.driveCount, 2);
  });

  it("stays empty when nothing was driven", () => {
    const stats = speedOverDrives([]);
    assert.equal(stats.maxSpeedMph, null);
    assert.equal(stats.avgSpeedMph, null);
    assert.equal(stats.driveCount, 0);
  });
});