import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  grokFactSheet,
  localSuggestions,
  localWarnings,
  parseGrokNotes,
  parseGrokSuggestions,
  type SuggestionFacts,
} from "./suggestions";

function facts(overrides: Partial<SuggestionFacts> = {}): SuggestionFacts {
  return {
    id: "demo",
    model: "Model Y",
    state: "parked",
    batteryPercent: 70,
    chargeLimitPercent: 80,
    odometerMi: 40691,
    tpmsPsi: [42, 42.2, 41.8, 42.1],
    softwareVersion: "2026.32.6",
    updateAvailable: null,
    climateOn: false,
    sentry: true,
    atHome: true,
    outsideTempC: 8,
    insideTempC: 21,
    locked: true,
    doorOpen: false,
    windowsOpen: false,
    frunkOpen: false,
    trunkOpen: false,
    chargePortOpen: false,
    chargingState: "Disconnected",
    alerts: [],
    service: [],
    ...overrides,
  };
}

describe("local suggestions", () => {
  it("returns three car notes and does not call them Grok", () => {
    const items = localSuggestions(facts());
    assert.equal(items.length, 3);
    assert.equal(items.some((item) => /grok/i.test(item.title + item.detail)), false);
  });

  it("leads with the car's actual problems", () => {
    const items = localSuggestions(
      facts({
        chargeLimitPercent: 95,
        updateAvailable: "2026.32.6",
        batteryPercent: 12,
        service: [{ title: "Tire rotation", status: "due", remaining: "150 mi overdue", detail: "Rotate." }],
      }),
    );
    assert.deepEqual(
      items.map((item) => item.title),
      ["Charge limit is high", "Software is waiting", "Battery is low"],
    );
  });

  it("includes the first due or soon service item on a calm car", () => {
    const items = localSuggestions(
      facts({
        service: [{ title: "Brake calipers", status: "due", remaining: "500 mi overdue", detail: "Clean them." }],
      }),
    );
    assert.equal(items[0]?.title, "Brake calipers");
    assert.match(items[0]?.detail ?? "", /Due: 500 mi overdue/);
  });

  it("prefers a due item over an earlier soon item", () => {
    const items = localSuggestions(
      facts({
        service: [
          { title: "Tire rotation", status: "soon", remaining: "350 mi left", detail: "Rotate." },
          { title: "Brake calipers", status: "due", remaining: "500 mi overdue", detail: "Clean." },
        ],
      }),
    );
    assert.equal(items[0]?.title, "Brake calipers");
  });
});

describe("local warnings", () => {
  it("stays empty on a calm car", () => {
    assert.deepEqual(localWarnings(facts()), []);
  });

  it("leads with real problems and leaves out filler tips", () => {
    const items = localWarnings(
      facts({
        chargeLimitPercent: 95,
        updateAvailable: "2026.32.6",
        batteryPercent: 12,
        tpmsPsi: [30, 42, 42, 42],
        service: [{ title: "Tire rotation", status: "due", remaining: "150 mi overdue", detail: "Rotate." }],
      }),
    );
    assert.deepEqual(
      items.map((item) => item.title),
      ["Tire pressures", "Charge limit is high", "Software is waiting"],
    );
    assert.equal(items.some((item) => item.title === "Daily charge habit"), false);
    assert.equal(items.some((item) => /grok/i.test(item.title + item.detail)), false);
  });

  it("mentions a door left open while parked", () => {
    const items = localWarnings(facts({ doorOpen: true, trunkOpen: true }));
    assert.equal(items[0]?.title, "Something is open");
    assert.match(items[0]?.detail ?? "", /a door, the trunk/);
  });
});

describe("Grok suggestion parsing", () => {
  it("reads a fenced JSON payload and keeps three items", () => {
    const text = `\`\`\`json
{"suggestions":[
  {"title":"One","detail":"First"},
  {"title":"${"A".repeat(100)}","detail":"${"B".repeat(300)}"},
  {"title":"Three","detail":"Third"},
  {"title":"Four","detail":"Dropped"}
]}
\`\`\``;
    const items = parseGrokSuggestions(text);
    assert.equal(items.length, 3);
    assert.equal(items[1]?.title.length, 80);
    assert.equal(items[1]?.detail.length, 240);
    assert.equal(items.some((item) => item.title === "Four"), false);
  });

  it("returns nothing for prose", () => {
    assert.deepEqual(parseGrokSuggestions("Check the tires."), []);
    const notes = parseGrokNotes("The tire looks low.");
    assert.deepEqual(notes.warnings, []);
    assert.equal(notes.sawWarnings, false);
  });

  it("keeps an empty warnings list and drops a fourth warning", () => {
    const calm = parseGrokNotes('{"suggestions":[{"title":"Habit","detail":"Leave it at 80%."}],"warnings":[]}');
    assert.equal(calm.sawWarnings, true);
    assert.deepEqual(calm.warnings, []);
    const noisy = parseGrokNotes(
      `{"warnings":[{"title":"One","detail":"A"},{"title":"Two","detail":"B"},{"title":"Three","detail":"C"},{"title":"Four","detail":"D"}]}`,
    );
    assert.equal(noisy.warnings.length, 3);
    assert.equal(noisy.warnings.some((item) => item.title === "Four"), false);
    assert.equal(noisy.sawWarnings, true);
  });

  it("treats a missing warnings field as unseen", () => {
    const notes = parseGrokNotes('{"suggestions":[{"title":"Habit","detail":"Leave it at 80%."}]}');
    assert.equal(notes.sawWarnings, false);
    assert.deepEqual(notes.warnings, []);
    assert.equal(notes.suggestions.length, 1);
  });

  it("keeps the VIN and coordinates out of the fact sheet", () => {
    const sheet = grokFactSheet(facts({ alerts: ["FL tire is 30 psi"] }));
    assert.equal(sheet.includes("VIN"), false);
    assert.equal(sheet.includes("41.9482"), false);
    assert.match(sheet, /Odometer: about 40700 mi/);
    assert.match(sheet, /Charge limit: 80%/);
    assert.match(sheet, /Alerts: FL tire is 30 psi/);
    assert.match(sheet, /Open: none/);
  });
});
