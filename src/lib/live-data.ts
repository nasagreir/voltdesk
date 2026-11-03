export const LIVE_DATA_MINUTES = 30;
export const LIVE_POLL_SECONDS = 15;

export function isLiveData(until: string | null | undefined, now = Date.now()) {
  if (!until) return false;
  const ends = Date.parse(until);
  return Number.isFinite(ends) && ends > now;
}

export function liveDataUntilFrom(now = Date.now()) {
  return new Date(now + LIVE_DATA_MINUTES * 60 * 1000).toISOString();
}

export function pollSeconds(
  states: readonly string[],
  pollIntervalSeconds: number,
  live: boolean,
) {
  if (live) return LIVE_POLL_SECONDS;
  const active = states.some((state) => state === "driving" || state === "charging");
  return active ? Math.min(LIVE_POLL_SECONDS, pollIntervalSeconds) : pollIntervalSeconds;
}
