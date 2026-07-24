// 7-day venue weather outlook. Geocodes the venue (reusing the Nominatim
// helper) then fetches a daily forecast from Open-Meteo (free, keyless,
// CORS-enabled) — same client-side-fetch pattern as routePlanner.ts.

import { geocodeDestination } from "../logistics/routePlanner";

// Adverse-weather thresholds operators care about for contingency planning.
export const RAIN_PROBABILITY_THRESHOLD = 60; // percent
export const WIND_SPEED_THRESHOLD = 25; // mph

export type VenueLocation = {
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
};

export type WeatherDay = {
  date: string; // ISO YYYY-MM-DD
  highF: number;
  lowF: number;
  rainProbability: number; // percent, 0 if unknown
  windMph: number;
  adverse: boolean;
};

export function locationQuery(venue: VenueLocation): string {
  return [venue.postalCode, venue.city, venue.region, venue.countryCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

// A day is flagged when rain is likely OR winds are high — either forces a
// contingency plan (tent, reschedule, wind-rated equipment).
export function isAdverse(rainProbability: number, windMph: number): boolean {
  return (
    rainProbability > RAIN_PROBABILITY_THRESHOLD ||
    windMph > WIND_SPEED_THRESHOLD
  );
}

type OpenMeteoDaily = {
  time?: string[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: (number | null)[];
  wind_speed_10m_max?: number[];
};

// Returns 7 days of forecast, or null when the venue can't be located or the
// forecast APIs are unreachable. Callers render a graceful fallback on null.
export async function fetchVenueForecast(
  venue: VenueLocation,
): Promise<WeatherDay[] | null> {
  const query = locationQuery(venue);
  if (!query) return null;

  const point = await geocodeDestination(query);
  if (!point) return null;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7";

  let daily: OpenMeteoDaily | undefined;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    daily = ((await response.json()) as { daily?: OpenMeteoDaily }).daily;
  } catch {
    return null; // network failure — caller retries next render
  }
  if (!daily?.time?.length) return null;

  return daily.time.map((date, i) => {
    const rainProbability = daily.precipitation_probability_max?.[i] ?? 0;
    const windMph = daily.wind_speed_10m_max?.[i] ?? 0;
    return {
      date,
      highF: Math.round(daily.temperature_2m_max?.[i] ?? 0),
      lowF: Math.round(daily.temperature_2m_min?.[i] ?? 0),
      rainProbability: Math.round(rainProbability),
      windMph: Math.round(windMph),
      adverse: isAdverse(rainProbability, windMph),
    };
  });
}
