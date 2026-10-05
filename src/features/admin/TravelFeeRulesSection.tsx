import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import {
  useCreateOrganization,
  useOrganizationConfigureTravelFee,
} from "../../lib/manifest-convex-react";
import {
  readTravelFeeRule,
  type TravelFeeMode,
  type TravelFeeZone,
} from "../../lib/travelFee";
import { Section } from "../../ui/primitives";

const zonesText = (zones: TravelFeeZone[]) =>
  zones.map((zone) => `${zone.upToMiles}, ${zone.fee}`).join("\n");

/** "10, 50" per line → bands; a line that is not two numbers is an error. */
function parseZonesText(text: string): TravelFeeZone[] | string {
  const zones: TravelFeeZone[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [miles, fee] = line.split(/[,=\s]+/).map(Number);
    if (!(miles > 0) || !(fee >= 0)) {
      return `"${line}" is not a band. Write the miles, then the fee, like 10, 50.`;
    }
    zones.push({ upToMiles: miles, fee });
  }
  return zones.sort((a, b) => a.upToMiles - b.upToMiles);
}

/**
 * Company travel & delivery fee rule: proposals and invoices for an event
 * price their travel line from it and the kitchen-to-venue distance.
 */
export function TravelFeeRulesSection({
  record,
  canEdit,
  busy,
  run,
}: {
  record: Doc<"organizations"> | null;
  canEdit: boolean;
  busy: boolean;
  run: (work: () => Promise<unknown>, done: string) => Promise<boolean>;
}) {
  const rule = readTravelFeeRule(record);
  const createOrganization = useCreateOrganization();
  const configure = useOrganizationConfigureTravelFee();
  const [mode, setMode] = useState<TravelFeeMode>(rule.mode);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = (key: string) => Math.max(0, Number(data.get(key)) || 0);
    const zones = parseZonesText(String(data.get("zones") ?? ""));
    if (typeof zones === "string") {
      setZoneError(zones);
      return;
    }
    if (mode === "zone" && zones.length === 0) {
      setZoneError("Add at least one distance band, like 10, 50.");
      return;
    }
    setZoneError(null);
    await run(async () => {
      let docId = record?._id;
      let version = record?.version;
      if (!docId) {
        const created = (await createOrganization({ name: "My company" })) as {
          docId: Doc<"organizations">["_id"];
        };
        docId = created.docId;
        version = undefined;
      }
      await configure({
        docId,
        version,
        mode,
        ratePerMile: amount("ratePerMile"),
        freeMiles: amount("freeMiles"),
        minimumFee: amount("minimumFee"),
        roundTrip: data.get("roundTrip") === "on",
        zonesJson: JSON.stringify(zones),
      });
    }, "Travel fee rules saved. New proposals and invoices use them.");
  };

  return (
    <Section title="Travel & delivery fee">
      <p className="text-base text-ink-2">
        Capsule works out each event&apos;s travel fee from the distance between
        the kitchen and the venue, and adds it as a line on the proposal and the
        invoice. Each event can still set its own fee.
      </p>
      <form
        key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
        className="supply-form mt-3 border-0 shadow-none"
        onSubmit={(e) => void save(e)}
      >
        <fieldset
          disabled={!canEdit || busy}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label>
            How to charge
            <select
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as TravelFeeMode)}
            >
              <option value="off">No travel fee</option>
              <option value="per_mile">Rate per mile</option>
              <option value="zone">Fee by distance band</option>
            </select>
          </label>
          <label>
            Rate per mile ($)
            <input
              name="ratePerMile"
              type="number"
              min={0}
              step="0.01"
              defaultValue={rule.ratePerMile}
            />
            {mode === "zone" ? (
              <span className="mt-1 block text-xs font-normal text-ink-3">
                Charged for each mile past the last band.
              </span>
            ) : null}
          </label>
          <label>
            Free miles
            <input
              name="freeMiles"
              type="number"
              min={0}
              step="0.1"
              defaultValue={rule.freeMiles}
            />
            <span className="mt-1 block text-xs font-normal text-ink-3">
              No fee up to this distance.
            </span>
          </label>
          <label>
            Smallest fee ($)
            <input
              name="minimumFee"
              type="number"
              min={0}
              step="0.01"
              defaultValue={rule.minimumFee}
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              name="roundTrip"
              type="checkbox"
              defaultChecked={rule.roundTrip}
            />
            Count the miles there and back
          </label>
          {mode === "zone" ? (
            <label className="sm:col-span-2">
              Distance bands
              <textarea
                name="zones"
                rows={4}
                defaultValue={zonesText(rule.zones)}
                placeholder={"10, 50\n25, 90\n50, 150"}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                One band per line: up to this many miles, then the fee.
              </span>
            </label>
          ) : (
            <input type="hidden" name="zones" value={zonesText(rule.zones)} />
          )}
        </fieldset>
        {zoneError ? (
          <p role="alert" className="mt-2 text-base text-danger">
            {zoneError}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn btn-primary mt-3"
          disabled={!canEdit || busy}
        >
          Save travel fee
        </button>
      </form>
    </Section>
  );
}
