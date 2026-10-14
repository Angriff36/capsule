import { useMemo } from "react";
import {
  useBookingRuleChange,
  useCreateBookingRule,
  useListBookingRule,
} from "../../../lib/manifest-convex-react";
import {
  DEFAULT_RULES,
  MODE_LABEL,
  RESOURCE_LABEL,
  type BookingResource,
  type BookingRules,
  type BookingRuleValue,
  type BookingWarnMode,
} from "./bookingConflicts";

const RESOURCES: BookingResource[] = ["vehicle", "person", "equipment"];
const MODES: BookingWarnMode[] = ["same_day", "overlap", "off"];

/** The company's booking rules, with the defaults where none is saved. */
export function useBookingRules() {
  const rows = useListBookingRule();
  const start = useCreateBookingRule();
  const change = useBookingRuleChange();
  const live = useMemo(
    () =>
      (rows ?? []).filter((row) => row.deletedAt == null && row.setAt != null),
    [rows],
  );
  const rules = useMemo((): BookingRules => {
    const next = { ...DEFAULT_RULES };
    for (const row of live)
      next[row.resource as BookingResource] = {
        mode: row.mode as BookingWarnMode,
        gapMinutes: row.gapMinutes,
      };
    return next;
  }, [live]);
  const save = (resource: BookingResource, value: BookingRuleValue) => {
    const row = live.find((entry) => entry.resource === resource);
    return row
      ? change({
          docId: row._id,
          version: row.version,
          mode: value.mode,
          gapMinutes: value.gapMinutes,
        })
      : start({ resource, mode: value.mode, gapMinutes: value.gapMinutes });
  };
  return { rules, loading: rows === undefined, save };
}

/**
 * When the tracker warns about a double booking, set for vehicles, people
 * and equipment apart. A warning never stops a booking.
 */
export function BookingRulesPanel({
  rules,
  canEdit,
  onSave,
}: {
  rules: BookingRules;
  canEdit: boolean;
  onSave: (resource: BookingResource, value: BookingRuleValue) => void;
}) {
  return (
    <section className="trk-panel" aria-labelledby="trk-rules-title">
      <div className="trk-panel-head">
        <div>
          <h2 id="trk-rules-title">Double-booking rules</h2>
          <p>
            When to warn that something is already booked on another event. You
            can always book anyway.
          </p>
        </div>
      </div>
      <div className="trk-rules">
        {RESOURCES.map((resource) => {
          const rule = rules[resource];
          return (
            <div key={resource} className="trk-rule">
              <strong>{RESOURCE_LABEL[resource]}</strong>
              <select
                className="input"
                aria-label={`${RESOURCE_LABEL[resource]}: when to warn`}
                value={rule.mode}
                disabled={!canEdit}
                onChange={(event) =>
                  onSave(resource, {
                    ...rule,
                    mode: event.currentTarget.value as BookingWarnMode,
                  })
                }
              >
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABEL[mode]}
                  </option>
                ))}
              </select>
              <label
                className="trk-rule-gap"
                data-off={rule.mode !== "overlap" || undefined}
              >
                Gap between events
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={15}
                  key={`${resource}:${rule.gapMinutes}`}
                  defaultValue={rule.gapMinutes}
                  disabled={!canEdit || rule.mode !== "overlap"}
                  aria-label={`${RESOURCE_LABEL[resource]}: minutes between events`}
                  onBlur={(event) => {
                    const gap = Math.max(
                      0,
                      Math.round(Number(event.currentTarget.value) || 0),
                    );
                    if (gap !== rule.gapMinutes)
                      onSave(resource, { ...rule, gapMinutes: gap });
                  }}
                />
                min
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
