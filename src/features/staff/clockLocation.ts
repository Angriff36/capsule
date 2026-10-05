/**
 * Optional clock-in evidence (spec §12.2): the phone's time zone always, and
 * its location only when the person allows it. A refusal, no GPS, or a slow
 * fix never stops the clock-in.
 */
export type ClockEvidence = {
  timeZone?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
};

export function clockTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function readClockEvidence(timeoutMs = 4000): Promise<ClockEvidence> {
  const timeZone = clockTimeZone();
  const base: ClockEvidence = timeZone ? { timeZone } : {};
  const geo =
    typeof navigator !== "undefined" ? navigator.geolocation : undefined;
  if (!geo) return Promise.resolve(base);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(base), timeoutMs);
    geo.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          ...base,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy),
        });
      },
      () => {
        clearTimeout(timer);
        resolve(base);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
