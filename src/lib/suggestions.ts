import type { ServiceItem, SuggestionItem, SuggestionsPayload } from "@/lib/types";

export interface SuggestionFacts {
  id: string;
  model: string;
  state: string;
  batteryPercent: number;
  chargeLimitPercent: number;
  odometerMi: number;
  tpmsPsi: Array<number | null>;
  softwareVersion: string;
  updateAvailable: string | null;
  climateOn: boolean;
  sentry: boolean | null;
  atHome: boolean | null;
  outsideTempC: number | null;
  service: Pick<ServiceItem, "title" | "status" | "remaining" | "detail">[];
}

const OK_MS = 20 * 60 * 1000;
const FAIL_MS = 2 * 60 * 1000;

const cache = new Map<string, { at: number; payload: SuggestionsPayload }>();

export function clearSuggestionCache() {
  cache.clear();
}

export function suggestionCacheKey(facts: SuggestionFacts, day: string): string {
  const battery = Math.round(facts.batteryPercent / 5) * 5;
  const service = facts.service.map((item) => `${item.title}:${item.status}`).join(",");
  return `${facts.id}|${battery}|${service}|${day}`;
}

function tireIssue(values: Array<number | null>): string | null {
  const psi = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (psi.length < 2) return null;
  const low = psi.some((value) => value < 36);
  const high = psi.some((value) => value > 48);
  const spread = Math.max(...psi) - Math.min(...psi);
  if (!low && !high && spread < 4) return null;
  if (low) return "At least one tire is under 36 psi. Check them cold before the next drive.";
  if (high) return "At least one tire is over 48 psi. Check them cold before the next drive.";
  return `The tires differ by about ${spread.toFixed(1)} psi. Check them cold and set them even.`;
}

export function localSuggestions(facts: SuggestionFacts): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  const tires = tireIssue(facts.tpmsPsi);
  if (tires) items.push({ title: "Tire pressures", detail: tires });
  if (facts.chargeLimitPercent >= 90) {
    items.push({
      title: "Charge limit is high",
      detail: `The limit is ${Math.round(facts.chargeLimitPercent)}%. Daily driving is easier on the pack near 80%, unless you need the range.`,
    });
  }
  if (facts.updateAvailable) {
    items.push({
      title: "Software is waiting",
      detail: `${facts.updateAvailable} is ready on the car. Install it when the car can sit and charge.`,
    });
  }
  if (facts.batteryPercent < 20) {
    items.push({
      title: "Battery is low",
      detail: `${Math.round(facts.batteryPercent)}% left. Plug in before the next drive if you can.`,
    });
  }
  const parked = facts.state === "parked" || facts.state === "asleep" || facts.state === "offline";
  if (facts.climateOn && parked) {
    items.push({
      title: "Climate is on while parked",
      detail: "The cabin is conditioning with the car parked. Turn it off if nobody is about to drive.",
    });
  }
  if (facts.sentry === false && facts.atHome === false && parked) {
    items.push({
      title: "Sentry is off away from home",
      detail: "The car is parked away from home with Sentry off.",
    });
  }
  const service =
    facts.service.find((item) => item.status === "due") ??
    facts.service.find((item) => item.status === "soon");
  if (service) {
    const when = service.status === "due" ? "Due" : "Coming up";
    items.push({
      title: service.title,
      detail: `${when}: ${service.remaining}. ${service.detail}`,
    });
  }
  const fillers: SuggestionItem[] = [
    {
      title: "Daily charge habit",
      detail: "Leave the limit near 80% and raise it the night before a long trip.",
    },
    {
      title: "Cold tire check",
      detail: "Pressures look steady. Recheck them cold after a big temperature swing.",
    },
    {
      title: "Service rhythm",
      detail: "Rotation, the cabin filter, brake fluid, and wipers are the items Tesla lists. The Service page keeps the dates.",
    },
  ];
  for (const filler of fillers) {
    if (items.length >= 3) break;
    if (filler.title === "Daily charge habit" && facts.chargeLimitPercent >= 90) continue;
    if (filler.title === "Cold tire check" && tires) continue;
    if (items.some((item) => item.title === filler.title)) continue;
    items.push(filler);
  }
  return items.slice(0, 3);
}

export function parseGrokSuggestions(text: string): SuggestionItem[] {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) raw = fence[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { suggestions?: unknown }).suggestions)
      ? (parsed as { suggestions: unknown[] }).suggestions
      : [];
  const items: SuggestionItem[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const title =
      typeof (item as { title?: unknown }).title === "string"
        ? (item as { title: string }).title.trim().slice(0, 80)
        : "";
    const detail =
      typeof (item as { detail?: unknown }).detail === "string"
        ? (item as { detail: string }).detail.trim().slice(0, 240)
        : "";
    if (!title || !detail) continue;
    items.push({ title, detail });
    if (items.length === 3) break;
  }
  return items;
}

export function grokFactSheet(facts: SuggestionFacts): string {
  const tires = facts.tpmsPsi.map((value) => (value == null ? "—" : value.toFixed(0))).join(", ");
  const outside =
    facts.outsideTempC == null ? "" : `Outside: about ${Math.round((facts.outsideTempC * 9) / 5 + 32)} F`;
  const service =
    facts.service.length === 0
      ? "Service: nothing tracked"
      : `Service: ${facts.service.map((item) => `${item.title} ${item.status} (${item.remaining})`).join("; ")}`;
  return [
    `Model: ${facts.model || "Tesla"}`,
    `State: ${facts.state}`,
    `Battery: ${Math.round(facts.batteryPercent)}%`,
    `Charge limit: ${Math.round(facts.chargeLimitPercent)}%`,
    `Odometer: about ${Math.round(facts.odometerMi / 100) * 100} mi`,
    `Tire psi, front left to rear right: ${tires}`,
    `Software: ${facts.softwareVersion || "unknown"}${facts.updateAvailable ? `, update waiting ${facts.updateAvailable}` : ""}`,
    `Climate on: ${facts.climateOn ? "yes" : "no"}`,
    `Sentry: ${facts.sentry == null ? "unknown" : facts.sentry ? "on" : "off"}`,
    `At home: ${facts.atHome == null ? "unknown" : facts.atHome ? "yes" : "no"}`,
    outside,
    service,
  ]
    .filter(Boolean)
    .join("\n");
}

async function askGrok(apiKey: string, facts: string, signal: AbortSignal): Promise<SuggestionItem[]> {
  const model = process.env.GROK_MODEL || "grok-4.7";
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            'You suggest three short, practical notes for the owner of this Tesla. Use only the facts given. Do not invent a maintenance interval, a part number, or a repair. Do not suggest waking, unlocking, or starting the car. Reply with JSON only, no markdown: {"suggestions":[{"title":"...","detail":"..."}]}. Each title is at most 60 characters. Each detail is at most 180 characters.',
        },
        { role: "user", content: facts },
      ],
    }),
    signal,
  });
  if (!response.ok) throw new Error("Grok did not answer");
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const items = parseGrokSuggestions(body.choices?.[0]?.message?.content ?? "");
  if (items.length === 0) throw new Error("Grok returned no suggestions");
  return items;
}

function fill(items: SuggestionItem[], local: SuggestionItem[]): SuggestionItem[] {
  const out = [...items];
  for (const item of local) {
    if (out.length >= 3) break;
    if (out.some((saved) => saved.title === item.title)) continue;
    out.push(item);
  }
  return out.slice(0, 3);
}

export async function suggestionsFor(
  apiKey: string,
  facts: SuggestionFacts,
  cacheKey: string,
): Promise<SuggestionsPayload> {
  const local = localSuggestions(facts);
  if (!apiKey) {
    return {
      source: "car",
      grokConfigured: false,
      note: "An xAI key on the Grok bot page will have Grok write these.",
      items: local,
    };
  }
  const hit = cache.get(cacheKey);
  const ttl = hit?.payload.source === "grok" ? OK_MS : FAIL_MS;
  if (hit && Date.now() - hit.at < ttl) return hit.payload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const items = fill(await askGrok(apiKey, grokFactSheet(facts), controller.signal), local);
    const payload: SuggestionsPayload = { source: "grok", grokConfigured: true, items };
    cache.set(cacheKey, { at: Date.now(), payload });
    return payload;
  } catch {
    const payload: SuggestionsPayload = {
      source: "car",
      grokConfigured: true,
      note: "Grok did not answer. These are from the car.",
      items: local,
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    return payload;
  } finally {
    clearTimeout(timer);
  }
}
