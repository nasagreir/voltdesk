import { formatDistance } from "@/lib/format";
import {
  isVisitId,
  visitTag,
  type DocumentExt,
  type DocumentStatus,
  type ServiceVisit,
  type StoredDocument,
} from "@/lib/service-docs";
import { chicagoDate, chicagoYMD, dayIndex } from "@/lib/time";
import type {
  DistanceUnit,
  MaintenancePayload,
  ServiceDocumentView,
  ServiceItem,
  ServiceStatus,
  ServiceVisitView,
} from "@/lib/types";

export const SERVICE_IDS = [
  "tires",
  "cabin-filter",
  "brake-fluid",
  "wipers",
  "brake-calipers",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export interface MaintenanceRecord {
  at: string;
  odometerMi: number | null;
}

export interface MaintenanceState {
  saltedRoads: boolean;
  records: Partial<Record<ServiceId, MaintenanceRecord>>;
  visits: ServiceVisit[];
}

export type { ServiceVisit, StoredDocument };

const DAY_MS = 86_400_000;

export const MAINTENANCE_DISCLAIMER =
  "These dates follow Tesla’s published maintenance list. They are not a substitute for Controls → Service → Maintenance in the car.";

interface Span {
  every: number;
  soon: number;
}

interface Spec {
  id: ServiceId;
  title: string;
  interval: string;
  detail: string;
  miles?: Span;
  days?: Span | ((model: string) => Span);
  saltedOnly?: boolean;
}

const SPECS: Spec[] = [
  {
    id: "tires",
    title: "Tire rotation",
    interval: "Every 6,250 mi",
    detail: "Rotate every 6,250 mi, or sooner if the tread differs by 2/32 in.",
    miles: { every: 6250, soon: 750 },
  },
  {
    id: "cabin-filter",
    title: "Cabin air filter",
    interval: "Every 2 years",
    detail: "Model 3 and Model Y: every 2 years. Model S and Model X: every 3 years.",
    days: (model) =>
      /model s|model x/i.test(model) ? { every: 365 * 3, soon: 60 } : { every: 365 * 2, soon: 60 },
  },
  {
    id: "brake-fluid",
    title: "Brake fluid",
    interval: "Health check every 4 years",
    detail: "Tesla asks for a health check every 4 years. Replace the fluid only if the test says so.",
    days: { every: 365 * 4, soon: 90 },
  },
  {
    id: "wipers",
    title: "Wiper blades",
    interval: "About once a year",
    detail: "Replace the blades about once a year.",
    days: { every: 365, soon: 45 },
  },
  {
    id: "brake-calipers",
    title: "Brake calipers",
    interval: "Yearly, or every 12,500 mi",
    detail:
      "Clean every year or 12,500 mi where roads are salted. Lubricate the pins only on a Model Y built through February 2025.",
    miles: { every: 12500, soon: 1000 },
    days: { every: 365, soon: 45 },
    saltedOnly: true,
  },
];

export function isServiceId(value: string): value is ServiceId {
  return (SERVICE_IDS as readonly string[]).includes(value);
}

export function demoRecords(now: Date, odometerMi: number): MaintenanceState["records"] {
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS).toISOString();
  const odo = Math.max(0, odometerMi);
  return {
    tires: { at: at(200), odometerMi: Math.max(0, odo - 5900) },
    "cabin-filter": { at: at(700), odometerMi: null },
    "brake-fluid": { at: at(400), odometerMi: null },
    wipers: { at: at(340), odometerMi: null },
    "brake-calipers": { at: at(40), odometerMi: Math.max(0, odo - 13000) },
  };
}

export function demoVisits(now: Date, odometerMi: number): ServiceVisit[] {
  return [
    {
      id: "demo0001",
      at: new Date(now.getTime() - 40 * DAY_MS).toISOString(),
      odometerMi: Math.max(0, odometerMi - 13000),
      itemIds: ["brake-calipers"],
      note: "Sample visit on the demo car. Attach an invoice to see it here.",
      documents: [],
    },
  ];
}

export function resolveMaintenance(
  saved: MaintenanceState | null,
  mode: "live" | "demo",
  now: Date,
  odometerMi: number,
): MaintenanceState {
  if (saved) return saved;
  if (mode === "demo") {
    return { saltedRoads: true, records: demoRecords(now, odometerMi), visits: demoVisits(now, odometerMi) };
  }
  return { saltedRoads: true, records: {}, visits: [] };
}

const DOCUMENT_EXTS = new Set<DocumentExt>(["pdf", "png", "jpg", "webp"]);
const DOCUMENT_STATUSES = new Set<DocumentStatus>(["ready", "filing", "missing"]);

function sanitizeDocument(raw: unknown): StoredDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<StoredDocument>;
  if (typeof item.id !== "string" || !/^[a-f0-9]{12}$/.test(item.id)) return null;
  if (typeof item.name !== "string" || !item.name.trim()) return null;
  if (typeof item.ext !== "string" || !DOCUMENT_EXTS.has(item.ext as DocumentExt)) return null;
  if (typeof item.addedAt !== "string" || Number.isNaN(Date.parse(item.addedAt))) return null;
  if (item.source !== "paperless" && item.source !== "local") return null;
  if (typeof item.status !== "string" || !DOCUMENT_STATUSES.has(item.status)) return null;
  const paperlessId = typeof item.paperlessId === "number" && Number.isFinite(item.paperlessId) ? item.paperlessId : null;
  return {
    id: item.id,
    name: item.name.trim().slice(0, 80),
    bytes: typeof item.bytes === "number" && item.bytes >= 0 ? Math.round(item.bytes) : 0,
    ext: item.ext,
    addedAt: item.addedAt,
    source: item.source,
    paperlessId,
    taskId: typeof item.taskId === "string" ? item.taskId.slice(0, 80) : null,
    status: item.status,
  };
}

function sanitizeVisit(raw: unknown): ServiceVisit | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ServiceVisit>;
  if (typeof item.id !== "string" || !isVisitId(item.id)) return null;
  if (typeof item.at !== "string" || Number.isNaN(Date.parse(item.at))) return null;
  const odometerMi =
    typeof item.odometerMi === "number" && item.odometerMi >= 0 && item.odometerMi <= 2_000_000
      ? item.odometerMi
      : null;
  const itemIds = Array.isArray(item.itemIds)
    ? item.itemIds.filter((id): id is ServiceId => typeof id === "string" && isServiceId(id))
    : [];
  const documents = Array.isArray(item.documents)
    ? item.documents.map(sanitizeDocument).filter((doc): doc is StoredDocument => doc != null).slice(0, 8)
    : [];
  return {
    id: item.id,
    at: item.at,
    odometerMi,
    itemIds,
    note: typeof item.note === "string" ? item.note.trim().slice(0, 400) : "",
    documents,
  };
}

export function sanitizeMaintenance(raw: unknown): MaintenanceState | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { saltedRoads?: unknown; records?: unknown; visits?: unknown };
  const records: MaintenanceState["records"] = {};
  const source = body.records && typeof body.records === "object" ? (body.records as Record<string, unknown>) : {};
  for (const id of SERVICE_IDS) {
    const item = source[id];
    if (!item || typeof item !== "object") continue;
    const at = (item as { at?: unknown }).at;
    const odo = (item as { odometerMi?: unknown }).odometerMi;
    if (typeof at !== "string" || Number.isNaN(Date.parse(at))) continue;
    const odometerMi =
      typeof odo === "number" && Number.isFinite(odo) && odo >= 0 && odo <= 2_000_000 ? odo : null;
    records[id] = { at, odometerMi };
  }
  const visits = Array.isArray(body.visits)
    ? body.visits.map(sanitizeVisit).filter((visit): visit is ServiceVisit => visit != null).slice(0, 40)
    : [];
  return { saltedRoads: body.saltedRoads !== false, records, visits };
}

export function serviceTitle(id: ServiceId): string {
  return SPECS.find((spec) => spec.id === id)?.title ?? id;
}

/** A visit updates an item only when it is the newest record for that item. */
export function withVisit(state: MaintenanceState, visit: ServiceVisit): MaintenanceState {
  const records = { ...state.records };
  const when = Date.parse(visit.at);
  for (const id of visit.itemIds) {
    const current = records[id];
    if (current && Date.parse(current.at) > when) continue;
    records[id] = { at: visit.at, odometerMi: visit.odometerMi };
  }
  const visits = [visit, ...state.visits.filter((saved) => saved.id !== visit.id)].slice(0, 40);
  return { ...state, records, visits };
}

export function withoutVisit(state: MaintenanceState, visitId: string): MaintenanceState {
  return { ...state, visits: state.visits.filter((visit) => visit.id !== visitId) };
}

export function parseServiceDate(value: string, now: Date): { at: string } | { error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { error: "Use a date like 2024-06-01." };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2008) return { error: "That date is before this car could have been serviced." };
  const built = chicagoDate(year, month, day, 12, 0);
  const back = chicagoYMD(built);
  if (back.y !== year || back.m !== month || back.d !== day) {
    return { error: "That date is not a real calendar day." };
  }
  const today = chicagoYMD(now);
  if (dayIndex(year, month, day) > dayIndex(today.y, today.m, today.d)) {
    return { error: "That date is still in the future." };
  }
  return { at: built.toISOString() };
}

export function parseOdometer(value: number): { odometerMi: number } | { error: string } {
  if (!Number.isFinite(value) || value < 0 || value > 2_000_000) {
    return { error: "Odometer has to be between 0 and 2,000,000 miles." };
  }
  return { odometerMi: value };
}

function daysElapsed(at: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(at).getTime()) / DAY_MS);
}

function gapText(remaining: number, kind: "mi" | "days", unit: DistanceUnit): string {
  const overdue = remaining < 0;
  const abs = Math.abs(remaining);
  if (kind === "days") {
    const count = Math.round(abs);
    const label = count === 1 ? "day" : "days";
    return `${count.toLocaleString("en-US")} ${label} ${overdue ? "overdue" : "left"}`;
  }
  const shown = unit === "km" ? abs * 1.609344 : abs;
  const count = Math.round(shown);
  return `${count.toLocaleString("en-US")} ${unit} ${overdue ? "overdue" : "left"}`;
}

function lastLabel(record: MaintenanceRecord | undefined, unit: DistanceUnit): string {
  if (!record) return "Not recorded";
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(record.at));
  if (record.odometerMi == null) return `${date} CT`;
  return `${date} CT · ${formatDistance(record.odometerMi, unit, 0)}`;
}

interface Judged {
  status: Exclude<ServiceStatus, "unset">;
  remaining: number;
  every: number;
  kind: "mi" | "days";
}

function judge(elapsed: number, span: Span, kind: "mi" | "days"): Judged {
  const remaining = span.every - elapsed;
  const status: Judged["status"] = remaining <= 0 ? "due" : remaining <= span.soon ? "soon" : "ok";
  return { status, remaining, every: span.every, kind };
}

function tightest(parts: Judged[]): Judged {
  return parts.reduce((best, part) =>
    part.remaining / part.every < best.remaining / best.every ? part : best,
  );
}

export function evaluateMaintenance(input: {
  now: Date;
  odometerMi: number;
  model: string;
  state: MaintenanceState;
  distanceUnit: DistanceUnit;
}): ServiceItem[] {
  const items: ServiceItem[] = [];
  for (const spec of SPECS) {
    if (spec.saltedOnly && !input.state.saltedRoads) continue;
    const record = input.state.records[spec.id];
    const days = typeof spec.days === "function" ? spec.days(input.model) : spec.days;
    const interval =
      spec.id === "cabin-filter" && /model s|model x/i.test(input.model) ? "Every 3 years" : spec.interval;
    const base = {
      id: spec.id,
      title: spec.title,
      interval,
      detail: spec.detail,
      lastLabel: lastLabel(record, input.distanceUnit),
    };
    if (!record) {
      items.push({ ...base, status: "unset", remaining: "Not recorded" });
      continue;
    }
    const parts: Judged[] = [];
    if (spec.miles && record.odometerMi != null) {
      const elapsed = Math.max(0, input.odometerMi - record.odometerMi);
      parts.push(judge(elapsed, spec.miles, "mi"));
    }
    if (days) parts.push(judge(Math.max(0, daysElapsed(record.at, input.now)), days, "days"));
    if (parts.length === 0) {
      items.push({ ...base, status: "unset", remaining: "Add the odometer when you mark this done." });
      continue;
    }
    const status: Exclude<ServiceStatus, "unset"> = parts.some((part) => part.status === "due")
      ? "due"
      : parts.some((part) => part.status === "soon")
        ? "soon"
        : "ok";
    const best = tightest(parts);
    items.push({
      ...base,
      status,
      remaining: gapText(best.remaining, best.kind, input.distanceUnit),
    });
  }
  return items;
}

function chicagoDayLabel(at: string): string {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(at));
  return `${date} CT`;
}

function presentVisits(visits: ServiceVisit[], unit: DistanceUnit, paperlessBase: string): ServiceVisitView[] {
  return [...visits]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((visit) => ({
      id: visit.id,
      dateLabel: chicagoDayLabel(visit.at),
      odometerLabel: visit.odometerMi == null ? "Odometer not recorded" : formatDistance(visit.odometerMi, unit, 0),
      note: visit.note,
      itemIds: visit.itemIds,
      items: visit.itemIds.map((id) => serviceTitle(id)),
      tag: visitTag(visit.id),
      documents: visit.documents.map((doc): ServiceDocumentView => ({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        source: doc.source,
        viewUrl: `/api/maintenance/documents/${doc.id}`,
        paperlessUrl:
          doc.paperlessId != null && paperlessBase ? `${paperlessBase}/documents/${doc.paperlessId}` : null,
      })),
    }));
}

export function presentMaintenance(input: {
  state: MaintenanceState;
  persisted: boolean;
  now: Date;
  odometerMi: number;
  model: string;
  vehicleName: string | null;
  distanceUnit: DistanceUnit;
  paperlessConfigured?: boolean;
  paperlessTag?: string;
  paperlessUrl?: string;
}): MaintenancePayload {
  const paperlessUrl = input.paperlessUrl ?? "";
  return {
    saltedRoads: input.state.saltedRoads,
    persisted: input.persisted,
    odometerMi: input.odometerMi,
    odometerLabel: formatDistance(input.odometerMi, input.distanceUnit, 0),
    distanceUnit: input.distanceUnit,
    vehicleName: input.vehicleName,
    model: input.model || null,
    disclaimer: MAINTENANCE_DISCLAIMER,
    items: evaluateMaintenance({
      now: input.now,
      odometerMi: input.odometerMi,
      model: input.model,
      state: input.state,
      distanceUnit: input.distanceUnit,
    }),
    visits: presentVisits(input.state.visits ?? [], input.distanceUnit, paperlessUrl),
    paperless: {
      configured: Boolean(input.paperlessConfigured),
      tag: input.paperlessTag || "VoltDesk",
      url: paperlessUrl,
    },
  };
}
