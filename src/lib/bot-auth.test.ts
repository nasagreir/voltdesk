import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenMatches } from "./bot-auth";
import { clampDays, vehicleSentence } from "./bot-payload";
import type { VehicleView } from "./types";

describe("bot token compare", () => {
  it("matches the same token and rejects a different one", () => {
    const token = `vd_${"ab".repeat(32)}`;
    assert.equal(tokenMatches(token, token), true);
    assert.equal(tokenMatches(`${token.slice(0, -1)}c`, token), false);
  });

  it("rejects a different length without throwing", () => {
    assert.equal(tokenMatches("vd_short", `vd_${"aa".repeat(32)}`), false);
    assert.equal(tokenMatches("", "vd_token"), false);
  });
});

describe("bot query window", () => {
  it("clamps days to 1 through 90", () => {
    assert.equal(clampDays(null), 14);
    assert.equal(clampDays("7"), 7);
    assert.equal(clampDays("0"), 1);
    assert.equal(clampDays("400"), 90);
    assert.equal(clampDays("nope"), 14);
  });
});

describe("bot vehicle sentence", () => {
  it("quotes state, battery, and demo mode", () => {
    const view = {
      name: "Roadrunner",
      model: "Model Y",
      trim: "Long Range AWD",
      state: "parked",
      atHome: true,
      stale: false,
      display: {
        speed: "0 mi",
        chargerPower: "0.0 kW",
        battery: "70%",
        ratedRange: "197 mi",
        odometer: "18,240 mi",
        updated: "Nov 2, 6:31 PM CT",
      },
    } as VehicleView;
    const sentence = vehicleSentence(view, "demo");
    assert.match(sentence, /Roadrunner \(Model Y Long Range AWD\) is parked at home/);
    assert.match(sentence, /Battery 70%/);
    assert.match(sentence, /demo car/);
  });
});
