export type TravelChoice = {
  rideVehicleAssignmentId?: string;
  meetsAtVenue?: boolean;
};

const MAIN = "main";
const VENUE = "venue";

/**
 * Which run one person travels with (spec §8.4 split crews): the main crew,
 * straight to the venue, or a truck on this event. Their shift times follow
 * that run. Changing it saves at once.
 */
export function EventStaffTravelSelect({
  label,
  rideVehicleAssignmentId,
  meetsAtVenue,
  trucks,
  busy,
  onChange,
}: {
  label: string;
  rideVehicleAssignmentId?: string | null;
  meetsAtVenue?: boolean | null;
  trucks: readonly { id: string; label: string }[];
  busy: boolean;
  onChange: (choice: TravelChoice) => void;
}) {
  const current =
    rideVehicleAssignmentId &&
    trucks.some((truck) => truck.id === rideVehicleAssignmentId)
      ? rideVehicleAssignmentId
      : meetsAtVenue === true
        ? VENUE
        : MAIN;
  return (
    <label className="field-label">
      <span className="sr-only">Travels with, for {label}</span>
      <select
        className="input min-h-10"
        value={current}
        disabled={busy}
        aria-label={`Travels with, for ${label}`}
        onChange={(changeEvent) => {
          const value = changeEvent.target.value;
          onChange(
            value === MAIN
              ? {}
              : value === VENUE
                ? { meetsAtVenue: true }
                : { rideVehicleAssignmentId: value },
          );
        }}
      >
        <option value={MAIN}>With the main crew</option>
        <option value={VENUE}>Meets at the venue</option>
        {trucks.map((truck) => (
          <option key={truck.id} value={truck.id}>
            Rides {truck.label}
          </option>
        ))}
      </select>
    </label>
  );
}
