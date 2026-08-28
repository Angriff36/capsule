import { useEffect, useState } from "react";
import { CloudSunIcon } from "./eventDetailIcons";
import { EventOverviewCard } from "./EventOverviewCard";
import {
  fetchVenueForecast,
  locationQuery,
  RAIN_PROBABILITY_THRESHOLD,
  WIND_SPEED_THRESHOLD,
  type VenueLocation,
  type WeatherDay,
} from "./eventWeather";

const WEEKDAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatDay(iso: string): string {
  // Parse as local date (avoid UTC shift on a bare YYYY-MM-DD).
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY.format(new Date(y, (m ?? 1) - 1, d ?? 1));
}

/**
 * 7-day weather outlook for the event venue. Fetches client-side from
 * Open-Meteo and flags days with rain probability > 60% or winds > 25 mph so
 * operators can arrange contingency plans.
 */
export function EventWeatherPanel({
  venue,
}: {
  readonly venue: VenueLocation | undefined | null;
}) {
  const [days, setDays] = useState<WeatherDay[] | null | undefined>(undefined);
  const query = venue ? locationQuery(venue) : "";

  useEffect(() => {
    if (!query) {
      setDays(null);
      return;
    }
    let active = true;
    setDays(undefined);
    void fetchVenueForecast(venue as VenueLocation).then((result) => {
      if (active) setDays(result);
    });
    return () => {
      active = false;
    };
  }, [query, venue]);

  const adverseCount = days?.filter((day) => day.adverse).length ?? 0;
  const description = !query
    ? "Add a venue address (postal code or city) to see the weather outlook."
    : days === undefined
      ? "Loading the venue forecast…"
      : days === null
        ? "Forecast unavailable — the venue could not be located or the weather service did not respond."
        : adverseCount > 0
          ? `${adverseCount} day${adverseCount === 1 ? "" : "s"} flagged for rain over ${RAIN_PROBABILITY_THRESHOLD}% or wind over ${WIND_SPEED_THRESHOLD} mph. Arrange a contingency plan.`
          : "No adverse weather in the 7-day outlook.";

  return (
    <EventOverviewCard
      title="Weather forecast"
      testId="event-weather-panel"
      aside={
        query ? (
          <span className="flex items-center gap-1.5 text-sm text-ink-3">
            <CloudSunIcon width={15} height={15} />
            {query}
          </span>
        ) : null
      }
    >
      <p className="mb-3 text-sm text-ink-2">{description}</p>
      {days && days.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {days.map((day) => (
            <li
              key={day.date}
              data-testid="event-weather-day"
              data-adverse={day.adverse ? "true" : "false"}
              className={`rounded-sm border p-2.5 text-sm ${
                day.adverse
                  ? "border-warn/50 bg-warn-soft/50"
                  : "border-line-2 bg-panel"
              }`}
            >
              <p className="font-medium text-ink">{formatDay(day.date)}</p>
              <p className="mt-1 text-ink-2">
                {day.highF}° / {day.lowF}°
              </p>
              <p className="text-ink-3">{day.rainProbability}% rain</p>
              <p className="text-ink-3">{day.windMph} mph wind</p>
              {day.adverse ? (
                <p className="mt-1 font-medium text-warn">Adverse</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </EventOverviewCard>
  );
}
