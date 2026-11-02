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
  energyAdded: string;
  inside: string;
  outside: string;
  setpoint: string;
  speed: string;
  tpms: Record<keyof TirePressures, string>;
  coords: string;
  homeDistance: string;
  updated: string;
}

export interface VehicleView extends Vehicle {
  display: VehicleDisplay;
}

export interface DashboardPayload {
  mode: ConnectionMode;
  source: DataSource;
  message: string;
  fetchedAt: string;
  units: { distance: DistanceUnit; temp: TempUnit };
  vehicles: VehicleView[];
  pollIntervalSeconds: number;
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
  placeLabel: string;
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
  demoForced: boolean;
}
