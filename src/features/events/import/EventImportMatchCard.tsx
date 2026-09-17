import type { CapsuleEventBundleCatalogMatch } from "../../../agent/CapsuleEventBundleExistingState";
import type { EventBundle } from "../../../lib/tppReports/eventBundle";
import {
  SearchSelect,
  type SearchSelectOption,
} from "../../../ui/SearchSelect";
import { bundleDishLines } from "./eventBundleCatalogMatch";

const NEW_RECORD = "__new__";

type Props = {
  bundle: EventBundle;
  match: CapsuleEventBundleCatalogMatch;
  onMatchChange: (next: CapsuleEventBundleCatalogMatch) => void;
  clientOptions: readonly SearchSelectOption[];
  venueOptions: readonly SearchSelectOption[];
  dishOptions: readonly SearchSelectOption[];
  disabled: boolean;
};

/**
 * Which existing records the import should reuse. Name matches are chosen
 * already; the person confirms or picks "create new". This is the step that
 * stops a second "Kamini Singh" or a twin "Singh Campsite" from appearing
 * (#368 items 3 and 6).
 */
export function EventImportMatchCard({
  bundle,
  match,
  onMatchChange,
  clientOptions,
  venueOptions,
  dishOptions,
  disabled,
}: Props) {
  const dishLines = bundleDishLines(bundle);
  const withNew = (options: readonly SearchSelectOption[], label: string) => [
    { id: NEW_RECORD, label, hint: "A new record is created on import." },
    ...options,
  ];
  const setDish = (key: string, id: string) => {
    const dishIds = { ...(match.dishIds ?? {}) };
    if (id === NEW_RECORD) delete dishIds[key];
    else dishIds[key] = id;
    onMatchChange({ ...match, dishIds });
  };
  const reused = Object.keys(match.dishIds ?? {}).length;

  return (
    <section className="card space-y-4 p-4" data-testid="event-import-match">
      <div>
        <p className="eyebrow">Existing records</p>
        <h2 className="text-base font-semibold text-ink">
          Reuse what is already in Capsule
        </h2>
        <p className="text-sm text-ink-3">
          Matched by name. Change any pick, or choose “create new”.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Client
          {bundle.client.name ? ` — “${bundle.client.name}” on the BEO` : ""}
          <SearchSelect
            value={match.clientId ?? NEW_RECORD}
            onChange={(id) =>
              onMatchChange({
                ...match,
                clientId: id === NEW_RECORD ? undefined : id,
              })
            }
            options={withNew(
              clientOptions,
              `Create new client${bundle.client.name ? `: ${bundle.client.name}` : ""}`,
            )}
            placeholder="Search clients…"
            disabled={disabled}
            testId="event-import-client"
          />
        </label>
        <label className="field-label">
          Venue{bundle.venue.name ? ` — “${bundle.venue.name}” on the BEO` : ""}
          <SearchSelect
            value={match.venueId ?? NEW_RECORD}
            onChange={(id) =>
              onMatchChange({
                ...match,
                venueId: id === NEW_RECORD ? undefined : id,
              })
            }
            options={withNew(
              venueOptions,
              bundle.venue.name
                ? `Create new venue: ${bundle.venue.name}`
                : "No venue on this event",
            )}
            placeholder="Search venues…"
            disabled={disabled}
            testId="event-import-venue"
          />
        </label>
      </div>

      {dishLines.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">
              Menu — {dishLines.length} dish{dishLines.length === 1 ? "" : "es"}
            </span>{" "}
            · {reused} matched to the catalog, {dishLines.length - reused} new
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {dishLines.map((line) => (
              <label key={line.key} className="field-label">
                {line.name}
                {line.quantityServings !== undefined
                  ? ` · ${line.quantityServings} servings`
                  : ""}
                <SearchSelect
                  value={match.dishIds?.[line.key] ?? NEW_RECORD}
                  onChange={(id) => setDish(line.key, id)}
                  options={withNew(
                    dishOptions,
                    `Create new dish: ${line.name}`,
                  )}
                  placeholder="Search catalog dishes…"
                  disabled={disabled}
                  testId={`event-import-dish-${line.key}`}
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
