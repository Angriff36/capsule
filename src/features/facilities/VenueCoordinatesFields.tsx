import { useState, type ClipboardEvent } from "react";
import { parseCoordinatePair } from "./venueCoordinates";

/**
 * Latitude / longitude inputs for a venue form. Pasting a whole
 * "47.01359° N, 116.52979° W" string into either box fills both, so the
 * coordinates off a TPP worksheet land in one paste (#368 item 9).
 * Uncontrolled form fields named `latitude` / `longitude`; read them with
 * `coordinatesFromFields` on submit.
 */
export function VenueCoordinatesFields({
  defaultLatitude,
  defaultLongitude,
  disabled,
  compact,
}: {
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  disabled?: boolean;
  /** Tighter inputs for inline forms (the New Event page). */
  compact?: boolean;
}) {
  const [latitude, setLatitude] = useState(
    defaultLatitude == null ? "" : String(defaultLatitude),
  );
  const [longitude, setLongitude] = useState(
    defaultLongitude == null ? "" : String(defaultLongitude),
  );

  const fillFromPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pair = parseCoordinatePair(event.clipboardData.getData("text"));
    if (!pair) return;
    event.preventDefault();
    setLatitude(String(pair.latitude));
    setLongitude(String(pair.longitude));
  };

  const inputClass = compact ? "input input-sm" : "input";
  return (
    <>
      <label className="field-label">
        Latitude
        <input
          name="latitude"
          className={inputClass}
          inputMode="decimal"
          placeholder="47.01359"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          onPaste={fillFromPaste}
          disabled={disabled}
          data-testid="venue-latitude"
        />
        <span className="field-hint">
          For venues with no street address. Paste “47.01359° N, 116.52979° W”
          into either box to fill both.
        </span>
      </label>
      <label className="field-label">
        Longitude
        <input
          name="longitude"
          className={inputClass}
          inputMode="decimal"
          placeholder="-116.52979"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
          onPaste={fillFromPaste}
          disabled={disabled}
          data-testid="venue-longitude"
        />
      </label>
    </>
  );
}
