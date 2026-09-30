import { useState, type FormEvent } from "react";
import type { Doc } from "../../lib/api";
import {
  useCreateOrganization,
  useListServiceStyle,
  useOrganizationConfigureTimingPolicy,
} from "../../lib/manifest-convex-react";
import { readTimingPolicy, type LoadRule } from "../../lib/eventTimingPolicy";
import { Section } from "../../ui/primitives";

type RuleRow = {
  key: number;
  label: string;
  serviceStyle: string;
  minGuests: string;
  maxGuests: string;
  minPackItems: string;
  minVehicles: string;
  minutes: string;
};

const text = (value: number | null | undefined) =>
  value == null ? "" : String(value);
const count = (value: string) =>
  value.trim() === "" ? null : Math.max(0, Math.round(Number(value)));

let nextKey = 1;
const toRow = (rule?: LoadRule): RuleRow => ({
  key: nextKey++,
  label: rule?.label ?? "",
  serviceStyle: rule?.serviceStyle ?? "",
  minGuests: text(rule?.minGuests),
  maxGuests: text(rule?.maxGuests),
  minPackItems: text(rule?.minPackItems),
  minVehicles: text(rule?.minVehicles),
  minutes: text(rule?.minutes),
});

/**
 * Company event timing rules (spec §8.4, PL-TIMING): setup before serve for
 * full and limited service, crew briefing before loading, and load time
 * rules. Open events that follow the rules are re-planned when these change.
 */
export function EventTimingRulesSection({
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
  const policy = readTimingPolicy(record);
  const styles = useListServiceStyle();
  const createOrganization = useCreateOrganization();
  const configure = useOrganizationConfigureTimingPolicy();
  const [rows, setRows] = useState<RuleRow[]>(() =>
    policy.loadRules.map((rule) => toRow(rule)),
  );

  const update = (key: number, field: keyof RuleRow, value: string) =>
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, [field]: value } : row,
      ),
    );

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const minutes = (key: string) => Math.round(Number(data.get(key)));
    const loadRules = rows
      .filter((row) => row.minutes.trim() !== "")
      .map((row, index) => ({
        id: `rule-${index + 1}`,
        label: row.label.trim() || `Load rule ${index + 1}`,
        serviceStyle: row.serviceStyle.trim() || null,
        minGuests: count(row.minGuests),
        maxGuests: count(row.maxGuests),
        minPackItems: count(row.minPackItems),
        minVehicles: count(row.minVehicles),
        minutes: Math.max(0, Math.round(Number(row.minutes))),
      }));
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
        fullServiceSetupMinutes: minutes("fullServiceSetupMinutes"),
        limitedServiceSetupMinutes: minutes("limitedServiceSetupMinutes"),
        briefingMinutes: minutes("briefingMinutes"),
        loadBaselineMinutes: minutes("loadBaselineMinutes"),
        loadRulesJson: JSON.stringify(loadRules),
      });
    }, "Timing rules saved. Open events that follow them are being updated.");
  };

  return (
    <Section title="Event timing rules">
      <p className="text-base text-ink-2">
        Capsule fills setup, load and crew briefing times on each event from
        these rules. A time someone changes on an event stays as they set it.
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
            Full service setup (minutes)
            <input
              name="fullServiceSetupMinutes"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={policy.fullServiceSetupMinutes}
            />
          </label>
          <label>
            Limited service setup (minutes)
            <input
              name="limitedServiceSetupMinutes"
              type="number"
              min={0}
              max={720}
              required
              defaultValue={policy.limitedServiceSetupMinutes}
            />
          </label>
          <label>
            Crew briefing before loading (minutes)
            <input
              name="briefingMinutes"
              type="number"
              min={0}
              max={240}
              required
              defaultValue={policy.briefingMinutes}
            />
          </label>
          <label>
            Standard load time (minutes)
            <input
              name="loadBaselineMinutes"
              type="number"
              min={0}
              max={480}
              required
              defaultValue={policy.loadBaselineMinutes}
            />
            <span className="mt-1 block text-xs font-normal text-ink-3">
              Used when no load rule below fits; the event asks someone to check
              it.
            </span>
          </label>
        </fieldset>

        <h3 className="mt-5 text-base font-semibold">Load time rules</h3>
        <p className="text-sm text-ink-2">
          The first rule that fits the event is used. Leave a box empty to match
          any value.
        </p>
        <datalist id="timing-rule-styles">
          {(styles ?? [])
            .filter((style) => style.deletedAt == null)
            .map((style) => (
              <option key={style._id} value={style.name} />
            ))}
        </datalist>
        <ul className="mt-2 space-y-3">
          {rows.map((row) => (
            <li key={row.key} className="card p-3">
              <fieldset
                disabled={!canEdit || busy}
                className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8"
              >
                <label className="sm:col-span-2">
                  Name
                  <input
                    value={row.label}
                    onChange={(e) => update(row.key, "label", e.target.value)}
                    placeholder="Big wedding"
                  />
                </label>
                <label className="sm:col-span-2">
                  Service style
                  <input
                    list="timing-rule-styles"
                    value={row.serviceStyle}
                    onChange={(e) =>
                      update(row.key, "serviceStyle", e.target.value)
                    }
                    placeholder="Any"
                  />
                </label>
                <label>
                  Guests from
                  <input
                    type="number"
                    min={0}
                    value={row.minGuests}
                    onChange={(e) =>
                      update(row.key, "minGuests", e.target.value)
                    }
                  />
                </label>
                <label>
                  Guests up to
                  <input
                    type="number"
                    min={0}
                    value={row.maxGuests}
                    onChange={(e) =>
                      update(row.key, "maxGuests", e.target.value)
                    }
                  />
                </label>
                <label>
                  Pack list lines from
                  <input
                    type="number"
                    min={0}
                    value={row.minPackItems}
                    onChange={(e) =>
                      update(row.key, "minPackItems", e.target.value)
                    }
                  />
                </label>
                <label>
                  Trucks from
                  <input
                    type="number"
                    min={0}
                    value={row.minVehicles}
                    onChange={(e) =>
                      update(row.key, "minVehicles", e.target.value)
                    }
                  />
                </label>
                <label>
                  Load minutes
                  <input
                    type="number"
                    min={0}
                    required
                    value={row.minutes}
                    onChange={(e) => update(row.key, "minutes", e.target.value)}
                  />
                </label>
              </fieldset>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-ghost mt-2 min-h-10"
                  disabled={busy}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((item) => item.key !== row.key),
                    )
                  }
                >
                  Remove rule
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-ghost mt-3 min-h-10"
            disabled={busy}
            onClick={() => setRows((current) => [...current, toRow()])}
          >
            Add load rule
          </button>
        ) : null}
        <div>
          <button
            type="submit"
            className="btn btn-primary mt-3"
            disabled={!canEdit || busy}
          >
            Save timing rules
          </button>
        </div>
      </form>
    </Section>
  );
}
