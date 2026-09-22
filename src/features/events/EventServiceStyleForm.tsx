import type { Id } from "../../lib/api";
import {
  useEventChangeServiceStyle,
  useListServiceStyle,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";

interface EventServiceStyleFormProps {
  eventId: Id<"events">;
  version: number | undefined;
  serviceStyleId?: Id<"serviceStyles"> | null;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}

/**
 * Change the event's service style. The style's default kit then goes onto the
 * event's pack list (logistics/pack-list.manifest). Event.changeServiceStyle
 * needs event manager access, the same as the command's own guard.
 */
export function EventServiceStyleForm({
  eventId,
  version,
  serviceStyleId,
  busy,
  run,
}: EventServiceStyleFormProps) {
  const authStatus = useAuthStatus();
  const serviceStyles = useListServiceStyle();
  const changeServiceStyle = useEventChangeServiceStyle();

  const canChange = resolveManifestPolicies(authStatus?.role ?? "").includes(
    "eventManageAccess",
  );
  const blockedReason = canChange
    ? undefined
    : "Changing the service style needs event manager access";
  const active = (serviceStyles ?? [])
    .filter((style) => style.deletedAt == null && style.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const current = (serviceStyles ?? []).find(
    (style) => style._id === serviceStyleId,
  );

  return (
    <form
      // Remount when the list arrives: an uncontrolled select that renders
      // before its options exist keeps the first option, not the saved style.
      key={`service-style-${version}-${serviceStyles === undefined ? "loading" : "ready"}`}
      className="flex min-w-0 flex-wrap items-end gap-2"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        const next = String(
          new FormData(formEvent.currentTarget).get("serviceStyleId") ?? "",
        );
        if (!next || next === serviceStyleId) return;
        // Snapshot the chosen style's name onto the event so a later catalog
        // rename cannot rewrite the printed service style.
        const nextName =
          (serviceStyles ?? []).find((style) => style._id === next)?.name ??
          undefined;
        void run(() =>
          changeServiceStyle({
            docId: eventId,
            version,
            serviceStyleId: next,
            serviceStyleName: nextName,
          }),
        );
      }}
    >
      <label className="field-label min-w-0 flex-1">
        <span>Service style</span>
        <select
          name="serviceStyleId"
          defaultValue={serviceStyleId ?? ""}
          className="input"
          disabled={!canChange || serviceStyles === undefined}
          title={blockedReason}
        >
          <option value="" disabled>
            Not set
          </option>
          {current && !active.some((style) => style._id === current._id) ? (
            <option value={current._id} disabled>
              {current.name} (retired)
            </option>
          ) : null}
          {active.map((style) => (
            <option key={style._id} value={style._id}>
              {style.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="btn btn-ghost min-h-10"
        disabled={!canChange || busy}
        title={blockedReason}
      >
        Save
      </button>
    </form>
  );
}
