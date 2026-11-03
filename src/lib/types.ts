export type ConnectionMode = "live" | "demo";

export type DataSource = "tesla" | "home-assistant" | "demo";

export type SourcePreference = "auto" | "tesla" | "home-assistant" | "demo";

export type TeslaRegion = "na" | "eu" | "cn";

export type DistanceUnit = "mi" | "km";

export type TempUnit = "F" | "C";

export type VehicleActivity =
  | "parked"
  | "driving"
  | "charging"
  | "asleep"
  | "offline";

export type ShiftState = "D" | "R" | "P" | "N" | null;

export type ChargeBilling = "home" | "work" | "supercharger" | "other";

export type HistoryRange = "24h" | "7d" | "14d";

export interface TirePressures {
  fl: number | null;
  fr: number | null;
  rl: number | null;
  rr: number | null;
}

export interface Vehicle {
  id: string;
  name: string;
  vin: string;
  model: string;
  trim: string;
  color: string;
  packKwh: number;
  state: VehicleActivity;
  softwareVersion: string;
  updateAvailable: string | null;
  odometerMi: number;
  batteryPercent: number;
  chargeLimitPercent: number;
  ratedRangeMi: number;
  estRangeMi: number;
  chargingState: string;
  chargerPowerKw: number;
  chargeRateMph: number;
  minutesToFull: number | null;
  energyAddedKwh: number;
  cable: string;
  chargePortOpen: boolean;
  insideTempC: number | null;
  outsideTempC: number | null;
  climateOn: boolean;
  setpointC: number | null;
  locked: boolean | null;
  sentry: boolean | null;
  windowsOpen: boolean;
  frunkOpen: boolean;
  trunkOpen: boolean;
  doorOpen: boolean;
  tpmsPsi: TirePressures;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speedMph: number;
  shiftState: ShiftState;
  atHome: boolean | null;
  homeDistanceMi: number | null;
  lastUpdated: string;
  stale: boolean;
  alerts: string[];
  powerKw?: number | null;
  elevationM?: number | null;
  idealRangeMi?: number | null;
  usableBatteryPercent?: number | null;
  chargerVoltage?: number | null;
  chargerCurrent?: number | null;
  chargerPhases?: number | null;
  fastCharger?: boolean;
}

export interface VehicleDisplay {
  odometer: string;
  ratedRange: string;
  estRange: string;
  battery: string;
  chargeLimit: string;
  chargerPower: string;
  chargeRate: string;
  timeToFull: string;
  doneBy: string;
  energyAdded: string;
  inside: string;
  outside: string;
  setpoint: string;
  speed: string;
  tpms: Record<keyof TirePressures, string>;
  coords: string;
  homeDistance: string;
  updated: string;
  idealRange: string;
  power: string;
  elevation: string;
}

export interface TripRange {
  rangeMi: number | null;
  atLimitMi: number | null;
  whPerMi: number | null;
  trips: number;
  distanceMi: number;
  range: string;
  atLimit: string;
  consumption: string;
  distance: string;
}

export interface VehicleView extends Vehicle {
  /** Name the car reported, before any name you typed. */
  reportedName: string;
  display: VehicleDisplay;
  tripRange?: TripRange;
  chargeCosts?: ChargeCostSummary;
}

export interface ChargeCostLine {
  id: string;
  when: string;
  place: string;
  label: string;
  energy: string;
  cost: string;
  free: boolean;
  billing: ChargeBilling;
  source: "guess" | "actual" | "unknown";
}

export interface ChargeCostSummary {
  lines: ChargeCostLine[];
  total: string;
  totalUsd: number;
  unpriced: number;
  count: number;
  windowDays: number;
}

export interface DashboardPayload {
  mode: ConnectionMode;
  source: DataSource;
  message: string;
  fetchedAt: string;
  units: { distance: DistanceUnit; temp: TempUnit };
  vehicles: VehicleView[];
  pollIntervalSeconds: number;
  /** True only during a timed live-data window. Off by default. */
  liveData: boolean;
  liveDataUntil: string | null;
}

export interface VehicleSample {
  at: string;
  vehicleId: string;
  name: string;
  batteryPercent: number;
  ratedRangeMi: number;
  odometerMi: number;
  chargingState: string;
  chargerPowerKw: number;
  energyAddedKwh: number;
  shiftState: ShiftState;
  speedMph: number;
  lat: number | null;
  lng: number | null;
  insideTempC: number | null;
  outsideTempC: number | null;
  packKwh: number;
  powerKw?: number | null;
  elevationM?: number | null;
  idealRangeMi?: number | null;
  estRangeMi?: number | null;
  usableBatteryPercent?: number | null;
  chargerVoltage?: number | null;
  chargerCurrent?: number | null;
  chargerPhases?: number | null;
  fastCharger?: boolean;
  softwareVersion?: string;
  activity?: VehicleActivity;
}

export interface DriveSession {
  id: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  inProgress: boolean;
  distanceMi: number;
  durationMin: number;
  startBattery: number;
  endBattery: number;
  efficiencyWhPerMi: number | null;
  fromLabel: string;
  toLabel: string;
  energyNetKwh: number | null;
  grossWhPerMi: number | null;
  avgSpeedMph: number;
  maxSpeedMph: number;
  maxPowerKw: number | null;
  minPowerKw: number | null;
  outsideTempC: number | null;
  elevationGainM: number | null;
  startRatedRangeMi: number;
  endRatedRangeMi: number;
  startIdealRangeMi: number | null;
  endIdealRangeMi: number | null;
  path: Array<{ lat: number; lng: number }>;
}

export interface ChargeSession {
  id: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  inProgress: boolean;
  energyKwh: number;
  startBattery: number;
  endBattery: number;
  durationMin: number;
  peakPowerKw: number;
  costUsd: number | null;
  /** Rate-based price before any amount you typed in. */
  guessUsd: number | null;
  /** What you paid, when you have entered it. */
  actualUsd: number | null;
  costSource: "guess" | "actual" | "unknown";
  billing: ChargeBilling;
  free: boolean;
  placeLabel: string;
  energyUsedKwh: number;
  rangeAddedMi: number;
  kind: "AC" | "DC";
  voltage: number | null;
  current: number | null;
  phases: number | null;
  outsideTempC: number | null;
  efficiencyPct: number | null;
  lat: number | null;
  lng: number | null;
}

export interface Geofence {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  costPerKwh: number;
  sessionFee: number;
}

export interface TimelineItem {
  at: string;
  kind: "drive" | "charge" | "update" | "state";
  title: string;
  detail: string;
  id?: string;
}

export interface ReportsPayload {
  vehicleId: string | null;
  vehicleName: string | null;
  mode: ConnectionMode;
  source: DataSource;
  message: string;
  fetchedAt: string;
  from: string;
  to: string;
  days: number;
  units: { distance: DistanceUnit; temp: TempUnit };
  statistics: {
    distanceMi: number;
    driveCount: number;
    driveMinutes: number;
    avgSpeedMph: number | null;
    maxSpeedMph: number | null;
    avgWhPerMi: number | null;
    avgGrossWhPerMi: number | null;
    elevationGainM: number | null;
    chargeCount: number;
    energyAddedKwh: number;
    chargeMinutes: number;
    costUsd: number | null;
  };
  driveStats: {
    count: number;
    distanceMi: number;
    durationMin: number;
    avgDistanceMi: number | null;
    avgDurationMin: number | null;
    avgSpeedMph: number | null;
    maxSpeedMph: number | null;
    efficiencyWhPerMi: number | null;
    energyNetKwh: number;
    byHour: Array<{ hour: number; count: number; distanceMi: number }>;
  };
  chargingStats: {
    count: number;
    energyKwh: number;
    energyUsedKwh: number;
    costUsd: number | null;
    durationMin: number;
    ac: { count: number; energyKwh: number; costUsd: number | null };
    dc: { count: number; energyKwh: number; costUsd: number | null };
    byPlace: Array<{ place: string; count: number; energyKwh: number; costUsd: number | null }>;
  };
  efficiency: {
    avgNetWhPerMi: number | null;
    avgGrossWhPerMi: number | null;
    points: Array<{ at: string; label: string; netWhPerMi: number | null; grossWhPerMi: number | null; distanceMi: number }>;
  };
  batteryHealth: {
    nominalMi: number | null;
    currentFullRatedMi: number | null;
    degradationPct: number | null;
    note: string;
    points: Array<{ at: string; label: string; odometerMi: number; fullRatedMi: number; degradationPct: number | null }>;
  };
  chargeLevel: Array<{ at: string; label: string; batteryPercent: number; usablePercent: number | null }>;
  projectedRange: Array<{ at: string; label: string; ratedRangeMi: number; estRangeMi: number | null }>;
  vampire: {
    totalSocDrop: number;
    totalHours: number;
    avgPctPerHour: number | null;
    events: Array<{ startedAt: string; endedAt: string; hours: number; socDrop: number; place: string }>;
  };
  states: {
    segments: Array<{ startedAt: string; endedAt: string; activity: VehicleActivity; minutes: number }>;
    totals: Record<VehicleActivity, number>;
  };
  mileage: {
    totalMi: number;
    points: Array<{ day: string; odometerMi: number; distanceMi: number }>;
  };
  temperatures: Array<{ at: string; label: string; insideC: number | null; outsideC: number | null }>;
  updates: Array<{ at: string; version: string; odometerMi: number }>;
  timeline: TimelineItem[];
  locations: Array<{ name: string; visits: number; minutes: number; lat: number | null; lng: number | null }>;
  visited: Array<{ lat: number; lng: number }>;
  drives: DriveSession[];
  charges: ChargeSession[];
}

export interface HistorySeriesPoint {
  at: string;
  label: string;
  batteryPercent: number;
  ratedRangeMi: number;
  chargerPowerKw: number;
}

export interface HistorySummary {
  sampleCount: number;
  distanceMi: number;
  driveCount: number;
  avgWhPerMi: number | null;
  energyAddedKwh: number;
  chargeCount: number;
  costUsd: number | null;
  driveMinutes: number;
  minBattery: number | null;
  maxBattery: number | null;
}

export interface TripsPayload {
  from: string;
  to: string;
  fromDay: string;
  toDay: string;
  vehicleId: string | null;
  vehicleName: string | null;
  mode: ConnectionMode;
  source: DataSource;
  message: string;
  units: { distance: DistanceUnit; temp: TempUnit };
  summary: {
    count: number;
    distanceMi: number;
    durationMin: number;
    avgWhPerMi: number | null;
  };
  trips: DriveSession[];
}

export interface HistoryPayload {
  range: HistoryRange;
  vehicleId: string | null;
  vehicleName: string | null;
  mode: ConnectionMode;
  source: DataSource;
  fetchedAt: string;
  units: { distance: DistanceUnit; temp: TempUnit };
  summary: HistorySummary;
  series: HistorySeriesPoint[];
  drives: DriveSession[];
  charges: ChargeSession[];
  message: string;
}

export interface AppSettings {
  source: SourcePreference;
  homeAssistantUrl: string;
  homeAssistantToken: string;
  teslaEntityPrefix: string;
  teslaRefreshToken: string;
  teslaClientId: string;
  teslaRegion: TeslaRegion;
  pollIntervalSeconds: number;
  distanceUnit: DistanceUnit;
  tempUnit: TempUnit;
  electricityRateUsd: number;
  homeLabel: string;
  homeLat: number | null;
  homeLng: number | null;
  homeRadiusM: number;
  workLabel: string;
  workLat: number | null;
  workLng: number | null;
  workRadiusM: number;
  /** Dollars per kWh at work. Zero means charging there is free. */
  workRateUsd: number;
  /** ISO time when a live-data window ends. Null leaves the car asleep. */
  liveDataUntil: string | null;
  /** Legacy single token. Folded into apiTokens on read and cleared on save. */
  apiToken: string;
  apiTokens: BotApiToken[];
  /** xAI key saved in settings. Environment keys stay out of this field. */
  grokApiKey: string;
  /** Paperless-ngx base URL. The API token is file-only, like the xAI key. */
  paperlessUrl: string;
  paperlessToken: string;
  paperlessTag: string;
}

export interface BotApiToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

export interface PublicBotToken {
  id: string;
  name: string;
  createdAt: string;
  hint: string;
}

export interface PublicSettings {
  source: SourcePreference;
  homeAssistantUrl: string;
  homeAssistantConfigured: boolean;
  teslaEntityPrefix: string;
  teslaConfigured: boolean;
  teslaClientId: string;
  teslaRegion: TeslaRegion;
  pollIntervalSeconds: number;
  distanceUnit: DistanceUnit;
  tempUnit: TempUnit;
  electricityRateUsd: number;
  homeLabel: string;
  homeLat: number | null;
  homeLng: number | null;
  homeRadiusM: number;
  workLabel: string;
  workLat: number | null;
  workLng: number | null;
  workRadiusM: number;
  workRateUsd: number;
  liveData: boolean;
  liveDataUntil: string | null;
  demoForced: boolean;
  /** True when a saved token or VOLTDESK_API_TOKEN can call the bot API. */
  botApiConfigured: boolean;
  botApiFromFile: boolean;
  botApiFromEnvironment: boolean;
  botTokens: PublicBotToken[];
  /** True when a saved xAI key or XAI_API_KEY / GROK_API_KEY can be used. */
  grokConfigured: boolean;
  grokFromFile: boolean;
  grokFromEnvironment: boolean;
  paperlessUrl: string;
  paperlessTag: string;
  paperlessConfigured: boolean;
  paperlessFromFile: boolean;
  paperlessFromEnvironment: boolean;
}

export interface ServiceDocumentView {
  id: string;
  name: string;
  status: "ready" | "filing" | "missing";
  source: "paperless" | "local";
  viewUrl: string;
  paperlessUrl: string | null;
}

export interface ServiceVisitView {
  id: string;
  dateLabel: string;
  odometerLabel: string;
  note: string;
  itemIds: string[];
  items: string[];
  tag: string;
  documents: ServiceDocumentView[];
}

export type ServiceStatus = "due" | "soon" | "ok" | "unset";

export interface ServiceItem {
  id: string;
  title: string;
  interval: string;
  detail: string;
  status: ServiceStatus;
  remaining: string;
  lastLabel: string;
}

export interface MaintenancePayload {
  saltedRoads: boolean;
  persisted: boolean;
  odometerMi: number;
  odometerLabel: string;
  distanceUnit: DistanceUnit;
  vehicleName: string | null;
  model: string | null;
  disclaimer: string;
  items: ServiceItem[];
  visits: ServiceVisitView[];
  paperless: { configured: boolean; tag: string; url: string };
}

export interface SuggestionItem {
  title: string;
  detail: string;
}

export interface SuggestionsPayload {
  source: "grok" | "car";
  grokConfigured: boolean;
  note?: string;
  items: SuggestionItem[];
}
