import { useState } from "react";
import type { Id } from "../../lib/api";
import {
  useEventChooseOperatingLocation,
  useListOperatingLocation,
} from "../../lib/manifest-convex-react";
import { useEventRoute, useRefreshEventRoute } from "../../lib/useEventRoute";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { timeLabel } from "./EventTimingPlannerDraft";

type Leg = NonNullable<ReturnType<typeof useEventRoute>>["legs"][number];

const LEG_LABEL: Record<Leg["leg"], string> = {
  outbound: "Kitchen to venue",
  return: "Venue back to kitchen",
};

function legLine(leg: Leg): string {
  const fact = leg.fact;
  if (!fact || fact.durationSeconds == null) return "No drive time yet";
  const minutes = Math.ceil(fact.durationSeconds / 60);
  const km =
    fact.distanceMeters != null
      ? ` · ${(fact.distanceMeters / 1609.344).toFixed(1)} mi`
      : "";
  const traffic = fact.trafficApplied ? "with expected traffic" : "no traffic";
  return `${minutes} min drive${km} · ${traffic} · checked ${timeLabel(fact.fetchedAt)}`;
}

/**
 * Drive time from the route service (spec §8.4). The kitchen the crew leaves
 * from, each leg's stored drive time, and a button to fetch it again. The
 * times it gives feed the timing plan above; nothing here is typed by hand.
 */
export function EventDriveTimePanel({
  eventId,
  operatingLocationId,
  version,
  canChange,
}: {
  eventId: Id<"events">;
  operatingLocationId: string | null;
  version: number | undefined;
  canChange: boolean;
}) {
  const route = useEventRoute(eventId);
  const kitchens = useListOperatingLocation();
  const choose = useEventChooseOperatingLocation();
  const refresh = useRefreshEventRoute();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (route === undefined) return null;
  if (route === null) return null;

  const active = (kitchens ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await work();
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const fetchNow = async () => {
    let answer: Awaited<ReturnType<typeof refresh>> | null = null;
    const ok = await run(async () => {
      answer = await refresh({ eventId });
    });
    if (ok && answer) {
      const result = answer as Awaited<ReturnType<typeof refresh>>;
      setNotice(
        result.legs.every((leg) => leg.ok)
          ? "Drive times updated. The timing plan now uses them."
          : (result.legs.find((leg) => !leg.ok)?.reason ??
              "The drive time could not be fetched."),
      );
    }
  };

  return (
    <div
      className="mt-4 rounded-md border border-line p-4"
      aria-label="Drive time"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Drive time</h3>
        {canChange && !route.finished && (
          <button
            type="button"
            className="btn btn-ghost min-h-10"
            disabled={busy}
            onClick={() => void fetchNow()}
          >
            {busy ? "Checking…" : "Get drive time"}
          </button>
        )}
      </div>
      {active.length > 1 || operatingLocationId ? (
        <label className="field-label mt-3">
          <span>Crew leaves from</span>
          <select
            className="input min-h-10 w-full sm:max-w-sm"
            value={operatingLocationId ?? ""}
            disabled={busy || !canChange}
            onChange={(e) =>
              void run(() =>
                choose({
                  docId: eventId,
                  version,
                  operatingLocationId: e.target.value || undefined,
                }),
              )
            }
          >
            <option value="">Choose a kitchen</option>
            {active.map((row) => (
              <option key={row._id} value={row._id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      ) : route.origin.ok ? (
        <p className="mt-2 text-base text-ink-2">
          Crew leaves from {route.origin.endpoint.name}.
        </p>
      ) : null}
      {!route.origin.ok && (
        <p className="mt-2 text-base text-ink-2">{route.origin.problem}</p>
      )}
      {route.origin.ok && !route.destination.ok && (
        <p className="mt-2 text-base text-ink-2">{route.destination.problem}</p>
      )}
      {!route.providerConfigured && (
        <p className="mt-2 text-base text-ink-2">
          Drive times are not switched on yet. Until they are, type travel
          minutes in the timing plan.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line">
        {route.legs.map((leg) => (
          <li key={leg.leg} className="py-2">
            <p className="text-base font-semibold">{LEG_LABEL[leg.leg]}</p>
            <p className="text-base">{legLine(leg)}</p>
            {leg.state === "stale" && (
              <p className="text-sm text-ink-2">
                Out of date: {leg.staleReasons.join(" ")}
              </p>
            )}
            {leg.state === "missing" && leg.problem && (
              <p className="text-sm text-ink-2">{leg.problem}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-2">
        The crew leaves {route.policy.safetyBufferMinutes} spare minutes before
        the drive time (company rule).
      </p>
      {failure && (
        <div className="mt-3">
          <FailureBanner failure={failure} />
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-base">
          {notice}
        </p>
      )}
    </div>
  );
}
