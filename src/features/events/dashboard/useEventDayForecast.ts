import { useEffect, useState } from "react";
import { dayInWindow } from "../EventWeatherChip";
import {
  fetchVenueForecast,
  hasLocation,
  type VenueLocation,
  type WeatherDay,
} from "../eventWeather";

/**
 * The event day's forecast at the venue, the same source as the weather chip.
 * `located: false` means the venue has no coordinates or address to ask for.
 */
export function useEventDayForecast(
  venue: VenueLocation | null | undefined,
  startsAt: number | null | undefined,
): { located: boolean; loading: boolean; day: WeatherDay | null } {
  const [days, setDays] = useState<WeatherDay[] | null | undefined>(undefined);
  const located = venue ? hasLocation(venue) : false;

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
    venue?.latitude,
    venue?.longitude,
    venue?.postalCode,
    venue?.city,
    venue?.region,
    venue?.countryCode,
  ]);

  return {
    located,
    loading: located && days === undefined,
    day: dayInWindow(days, startsAt),
  };
}
