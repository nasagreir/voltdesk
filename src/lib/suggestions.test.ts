import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { grokFactSheet, localSuggestions, parseGrokSuggestions, type SuggestionFacts } from "./suggestions";

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
  });

  it("keeps the VIN and coordinates out of the fact sheet", () => {
    const sheet = grokFactSheet(facts());
    assert.equal(sheet.includes("VIN"), false);
    assert.equal(sheet.includes("41.9482"), false);
    assert.match(sheet, /Odometer: about 40700 mi/);
    assert.match(sheet, /Charge limit: 80%/);
  });
});
