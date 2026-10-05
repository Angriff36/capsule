import { useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api, type Doc } from "../../lib/api";
import {
  useCreateOperatingLocation,
  useCreateOrganization,
  useListOperatingLocation,
  useOperatingLocationActivate,
  useOperatingLocationDeactivate,
  useOperatingLocationRevise,
  useOrganizationConfigureRoutePolicy,
} from "../../lib/manifest-convex-react";
import {
  DEFAULT_ROUTE_POLICY,
  isValidTimeZone,
  readRoutePolicy,
} from "../../lib/routeFacts";
import { ErrorState, PageHeader, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useActionFailure, useActionNotice } from "../../ui/action-result";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import { EventTimingRulesSection } from "./EventTimingRulesSection";
import { useTenantBranding } from "./tenantBranding";

const canManage = (role: string | undefined) =>
  role === "manager" ||
  role === "admin" ||
  role === "owner" ||
  role === "system" ||
  Boolean(role?.endsWith("_manager"));

type Kitchen = Doc<"operatingLocations">;

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
};

function readKitchenForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (key: string) => String(data.get(key) ?? "").trim();
  return {
    name: value("name"),
    addressLine1: value("addressLine1"),
    addressLine2: value("addressLine2") || undefined,
    city: value("city"),
    region: value("region") || undefined,
    postalCode: value("postalCode") || undefined,
    countryCode: value("countryCode"),
    timeZone: value("timeZone"),
  };
}

function KitchenFields({
  kitchen,
  disabled,
}: {
  kitchen?: Kitchen;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
      <label>
        Kitchen name
        <input name="name" required defaultValue={kitchen?.name ?? ""} />
      </label>
      <label>
        Street address
        <input
          name="addressLine1"
          required
          defaultValue={kitchen?.addressLine1 ?? ""}
        />
      </label>
      <label>
        Address line 2
        <input name="addressLine2" defaultValue={kitchen?.addressLine2 ?? ""} />
      </label>
      <label>
        City
        <input name="city" required defaultValue={kitchen?.city ?? ""} />
      </label>
      <label>
        State or region
        <input name="region" defaultValue={kitchen?.region ?? ""} />
      </label>
      <label>
        Postal code
        <input name="postalCode" defaultValue={kitchen?.postalCode ?? ""} />
      </label>
      <label>
        Country (two letters)
        <input
          name="countryCode"
          required
          maxLength={2}
          defaultValue={kitchen?.countryCode ?? "US"}
        />
      </label>
      <label>
        Time zone
        <input
          name="timeZone"
          required
          defaultValue={kitchen?.timeZone ?? browserTimeZone()}
          placeholder="America/New_York"
        />
      </label>
    </fieldset>
  );
}

/**
 * Company kitchens (the places crews leave from) and the drive-time rules
 * (spec §8.4, PL-ROUTES). Drive times on events are fetched from these
 * addresses, never from a fixed address.
 */
export function KitchensPage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const kitchens = useListOperatingLocation();
  const { record, loading } = useTenantBranding();
  const add = useCreateOperatingLocation();
  const revise = useOperatingLocationRevise();
  const deactivate = useOperatingLocationDeactivate();
  const activate = useOperatingLocationActivate();
  const createOrganization = useCreateOrganization();
  const configureRules = useOrganizationConfigureRoutePolicy();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  const canEdit = canManage(authStatus?.role);

  if (authStatus === undefined || kitchens === undefined || loading) {
    return (
      <QueryLoadState
        loadingTooLong={false}
        title="Loading kitchens"
        detail="Reading where your crews leave from."
      />
    );
  }

  const policy = readRoutePolicy(record ?? null);
  const live = kitchens.filter((row) => row.deletedAt == null);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(done);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveKitchen = async (
    event: FormEvent<HTMLFormElement>,
    kitchen?: Kitchen,
  ) => {
    event.preventDefault();
    const fields = readKitchenForm(event.currentTarget);
    if (!isValidTimeZone(fields.timeZone)) {
      setError(
        `"${fields.timeZone}" is not a time zone. Use a name like America/New_York.`,
      );
      return;
    }
    const ok = await run(
      () =>
        kitchen
          ? revise({ docId: kitchen._id, version: kitchen.version, ...fields })
          : add(fields),
      kitchen
        ? "Kitchen saved. Drive times from its old address now show as out of date."
        : "Kitchen added.",
    );
    if (ok) {
      setEditing(null);
      setAdding(false);
    }
  };

  const saveRules = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const safetyBufferMinutes = Number(data.get("safetyBufferMinutes"));
    const refreshHours = Number(data.get("refreshHours"));
    const trafficPolicy = String(data.get("trafficPolicy"));
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
      await configureRules({
        docId,
        version,
        safetyBufferMinutes,
        trafficPolicy,
        refreshHours,
      });
    }, "Drive-time rules saved.");
  };

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Kitchens & drive times"
        lead="Where your crews leave from, the rules Capsule uses to work out drive times to each venue, and the setup, load and briefing times it plans for each event."
      />
      <AdminWorkspaceNav />
      {!canEdit ? (
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-base text-warn">
          Only a manager can change kitchens and drive-time rules.
        </div>
      ) : null}
      {error ? <ErrorState title="Not saved" detail={error} /> : null}
      {notice ? (
        <p
          role="status"
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-base text-ok"
        >
          {notice}
        </p>
      ) : null}

      <Section
        title="Kitchens"
        count={live.length}
        actions={
          canEdit && !adding ? (
            <button
              type="button"
              className="btn btn-ghost min-h-10"
              onClick={() => setAdding(true)}
            >
              Add kitchen
            </button>
          ) : null
        }
      >
        {live.length === 0 && !adding ? (
          <p className="text-base text-ink-2">
            No kitchen yet. Add the address your crews leave from so events can
            get drive times.
          </p>
        ) : null}
        {live.length > 1 ? (
          <p className="text-base text-ink-2">
            With more than one kitchen, pick the kitchen on each event's timing.
          </p>
        ) : null}
        {adding ? (
          <form
            className="supply-form border-0 shadow-none"
            onSubmit={(e) => void saveKitchen(e)}
          >
            <KitchenFields disabled={busy} />
            <div className="mt-3 flex gap-3">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save kitchen
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        <ul className="divide-y divide-line">
          {live.map((kitchen) => (
            <li key={kitchen._id} className="py-3">
              {editing === kitchen._id ? (
                <form
                  className="supply-form border-0 shadow-none"
                  onSubmit={(e) => void saveKitchen(e, kitchen)}
                >
                  <KitchenFields kitchen={kitchen} disabled={busy} />
                  <div className="mt-3 flex gap-3">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={busy}
                    >
                      Save kitchen
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">
                      {kitchen.name}
                      {kitchen.status !== "active" ? " (switched off)" : ""}
                    </p>
                    <p className="text-base text-ink-2">
                      {[
                        kitchen.addressLine1,
                        kitchen.city,
                        kitchen.region,
                        kitchen.countryCode,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      {kitchen.timeZone ? ` · ${kitchen.timeZone}` : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost min-h-10"
                        disabled={busy}
                        onClick={() => setEditing(kitchen._id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost min-h-10"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              kitchen.status === "active"
                                ? deactivate({
                                    docId: kitchen._id,
                                    version: kitchen.version,
                                  })
                                : activate({
                                    docId: kitchen._id,
                                    version: kitchen.version,
                                  }),
                            kitchen.status === "active"
                              ? "Kitchen switched off."
                              : "Kitchen switched on.",
                          )
                        }
                      >
                        {kitchen.status === "active"
                          ? "Switch off"
                          : "Switch on"}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Drive-time rules">
        <form
          key={`${record?._id ?? "new"}:${record?.version ?? 0}`}
          className="supply-form border-0 shadow-none"
          onSubmit={(e) => void saveRules(e)}
        >
          <fieldset
            disabled={!canEdit || busy}
            className="grid gap-3 sm:grid-cols-3"
          >
            <label>
              Spare minutes before leaving
              <input
                name="safetyBufferMinutes"
                type="number"
                min={0}
                max={240}
                required
                defaultValue={policy.safetyBufferMinutes}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                Added to the drive time so the crew leaves early.
              </span>
            </label>
            <label>
              Traffic
              <select name="trafficPolicy" defaultValue={policy.trafficPolicy}>
                <option value="traffic_aware">Use expected traffic</option>
                <option value="no_traffic">Plain road time</option>
              </select>
            </label>
            <label>
              Check drive times again after (hours)
              <input
                name="refreshHours"
                type="number"
                min={1}
                max={720}
                required
                defaultValue={
                  policy.refreshHours ?? DEFAULT_ROUTE_POLICY.refreshHours
                }
              />
            </label>
          </fieldset>
          <button
            type="submit"
            className="btn btn-primary mt-3"
            disabled={!canEdit || busy}
          >
            Save rules
          </button>
        </form>
      </Section>

      <EventTimingRulesSection
        record={record ?? null}
        canEdit={canEdit}
        busy={busy}
        run={run}
      />
    </div>
  );
}
