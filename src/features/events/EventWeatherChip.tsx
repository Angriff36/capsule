import { useEffect, useState } from "react";
import { CloudSunIcon } from "./eventDetailIcons";
import {
  fetchVenueForecast,
  hasLocation,
  RAIN_PROBABILITY_THRESHOLD,
  WIND_SPEED_THRESHOLD,
  type VenueLocation,
  type WeatherDay,
} from "./eventWeather";

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/**
 * The event day's weather as one quiet chip — no block, no card. The forecast
 * is the venue's (stored coordinates first, address geocode as fallback), the
 * day is the event's: when the event sits inside the forecast window the chip
 * shows that date's high/low, rain chance, and wind, and flags adverse
 * conditions. No venue location → no chip; beyond the window it says so
 * instead of guessing.
 */
export function EventWeatherChip({
  venue,
  startsAt,
}: {
  readonly venue: VenueLocation | undefined | null;
  readonly startsAt?: number | null;
}) {
  const [days, setDays] = useState<WeatherDay[] | null | undefined>(undefined);
  const located = venue ? hasLocation(venue) : false;
  const lat = venue?.latitude ?? null;
  const lon = venue?.longitude ?? null;

  useEffect(() => {
    if (!located || !venue) return;
    let active = true;
    setDays(undefined);
    void fetchVenueForecast(venue).then((result) => {
      if (active) setDays(result);
    });
    return () => {
      active = false;
    };
  }, [
    located,
    lat,
    lon,
    venue?.postalCode,
    venue?.city,
    venue?.region,
    venue?.countryCode,
  ]);

  if (!located) return null;

  const eventDay = dayInWindow(days, startsAt);
  const when = startsAt != null ? DAY_FORMAT.format(new Date(startsAt)) : null;

  if (days === undefined) {
    return (
      <span className="event-weather-chip" data-testid="event-weather-chip">
        <CloudSunIcon width={15} height={15} />
        Weather…
      </span>
    );
  }
  if (eventDay === null) {
    return (
      <span
        className="event-weather-chip"
        data-testid="event-weather-chip"
        title="The event date is outside the forecast window for this venue."
      >
        <CloudSunIcon width={15} height={15} />
        {when ? `No forecast yet for ${when}` : "No forecast yet"}
      </span>
    );
  }
  return (
    <span
      className="event-weather-chip"
      data-testid="event-weather-chip"
      data-adverse={eventDay.adverse ? "true" : "false"}
      title={
        eventDay.adverse
          ? `Adverse weather: rain over ${RAIN_PROBABILITY_THRESHOLD}% or wind over ${WIND_SPEED_THRESHOLD} mph — arrange a contingency plan.`
          : "Forecast for the event date at the venue."
      }
    >
      <CloudSunIcon width={15} height={15} />
      {when ? `${when} · ` : ""}
      {eventDay.highF}° / {eventDay.lowF}° · {eventDay.rainProbability}% rain ·{" "}
      {eventDay.windMph} mph{eventDay.adverse ? " · adverse" : ""}
    </span>
  );
}

/** The forecast row matching the event's local date, or null when absent. */
export function dayInWindow(
  days: WeatherDay[] | null | undefined,
  startsAt: number | null | undefined,
): WeatherDay | null {
  if (!days || days.length === 0) return null;
  if (startsAt == null) return days[0] ?? null;
  const target = new Date(startsAt);
  const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  return days.find((day) => day.date === iso) ?? null;
}
