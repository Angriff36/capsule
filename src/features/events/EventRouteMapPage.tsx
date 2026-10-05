import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import { useGetEvent } from "../../lib/manifest-convex-react";
import { useRouteRecord } from "../../lib/routeRecord";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useEventRoute } from "../../lib/useEventRoute";
import { ErrorState, TableSkeleton } from "../../ui/primitives";
import { useSendChatMessage } from "../chat/useTeamChat";
import { eventDetailPath } from "./eventRoutes";
// Same paper sheet and print rules as the allergen briefing.
import "./EventAllergenBriefingPage.css";

type Endpoint = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

const place = (point: Endpoint) =>
  point.latitude != null && point.longitude != null
    ? `${point.latitude},${point.longitude}`
    : point.address;

/** Google turn-by-turn directions from the kitchen to the venue. */
export function directionsUrl(origin: Endpoint, destination: Endpoint) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place(origin))}&destination=${encodeURIComponent(place(destination))}&travelmode=driving`;
}

/** Map frame covering the kitchen and the venue, pinned on the venue. */
function mapFrameUrl(origin: Endpoint | null, destination: Endpoint) {
  const lat = destination.latitude;
  const lon = destination.longitude;
  if (lat == null || lon == null) return null;
  const lats = [lat];
  const lons = [lon];
  if (origin?.latitude != null && origin.longitude != null) {
    lats.push(origin.latitude);
    lons.push(origin.longitude);
  }
  const pad = 0.01;
  const box = [
    Math.min(...lons) - pad,
    Math.min(...lats) - pad,
    Math.max(...lons) + pad,
    Math.max(...lats) + pad,
  ].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${box}&layer=mapnik&marker=${lat}%2C${lon}`;
}

/**
 * Printable map and directions from the kitchen the crew leaves from to the
 * venue. "?print=1" prints at once (the More menu's one-click Print map).
 * "Send to team chat" posts the directions, this map and the layouts to the
 * event's chat for the crew.
 */
export function EventRouteMapPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const event = useRouteRecord(useGetEvent, id);
  const route = useEventRoute((id ?? "") as Id<"events">);
  const auth = useAuthStatus();
  const send = useSendChatMessage();
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const printed = useRef(false);

  const origin = route?.origin.ok ? route.origin.endpoint : null;
  const destination = route?.destination.ok ? route.destination.endpoint : null;
  const outbound = route?.legs.find((leg) => leg.leg === "outbound")?.fact;
  const minutes =
    outbound?.durationSeconds != null
      ? Math.ceil(outbound.durationSeconds / 60)
      : null;
  const miles =
    outbound?.distanceMeters != null
      ? (outbound.distanceMeters / 1609.344).toFixed(1)
      : null;
  const ready = event != null && route !== undefined;

  useEffect(() => {
    if (!ready || printed.current || params.get("print") !== "1") return;
    printed.current = true;
    // Give the map tiles a moment to draw before the print dialog opens.
    const timer = window.setTimeout(() => window.print(), 1500);
    return () => window.clearTimeout(timer);
  }, [ready, params]);

  if (!id) {
    return (
      <ErrorState
        title="Event not found"
        detail="This link doesn't point to an event. Open the event again from the events list."
      />
    );
  }
  if (event === undefined || route === undefined) {
    return (
      <div className="operations-stage supply-stage">
        <TableSkeleton rows={6} />
      </div>
    );
  }
  if (event === null || event.deletedAt != null) {
    return (
      <ErrorState
        title="Event unavailable"
        detail="It may have been deleted, or you may not have access to it."
      />
    );
  }

  const directions =
    origin && destination ? directionsUrl(origin, destination) : null;
  const frame = destination ? mapFrameUrl(origin, destination) : null;
  const appUrl = window.location.origin;

  const sendToChat = async () => {
    if (!auth?.tenantId || !auth.personId) {
      setNotice("Sign in with your staff account to post in team chat.");
      return;
    }
    const lines = [
      `Map to ${destination?.name ?? event.venueName ?? "the venue"}${destination?.address ? ` (${destination.address})` : ""}.`,
      origin
        ? `Leave from ${origin.name}${minutes != null ? ` · about ${minutes} min drive` : ""}.`
        : null,
      directions ? `Directions: ${directions}` : null,
      `Printable map: ${appUrl}/events/${event._id}/map`,
      `Venue layouts: ${appUrl}${eventDetailPath(event._id, "layouts")}`,
    ].filter(Boolean);
    setSending(true);
    setNotice(null);
    try {
      await send(
        { kind: "event", eventId: event._id },
        {
          body: lines.join("\n"),
          files: [],
          mentionedPersonIds: [],
          draft: {
            text: lines.join("\n"),
            files: [],
            links: [],
            mentions: [],
          },
          idempotencyKey: crypto.randomUUID(),
        },
        { tenantId: auth.tenantId, personId: auth.personId },
      );
      setNotice("Sent to the event's team chat.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The message was not sent.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead briefing-no-print">
        <div>
          <p className="eyebrow">Events · Map</p>
          <h1 className="display-title mt-2">Map to the venue</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            From the kitchen the crew leaves from to the venue. Print it for the
            truck, or post it in the event&rsquo;s team chat with the venue
            layouts.
          </p>
          {notice ? (
            <p className="mt-2 text-base text-ink" role="status">
              {notice}
            </p>
          ) : null}
        </div>
        <div className="supply-row-actions">
          <Link className="btn btn-ghost" to={eventDetailPath(event._id)}>
            Back to event
          </Link>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={sending}
            onClick={() => void sendToChat()}
          >
            {sending ? "Sending…" : "Send to team chat"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => window.print()}
          >
            Print map
          </button>
        </div>
      </header>

      <article className="briefing-document mx-auto mt-6 max-w-200 p-8">
        <h1 className="text-xl font-semibold">Map · {event.title}</h1>
        <p className="mt-1 text-base text-ink-2">
          {event.startsAt != null
            ? `${formatDate(event.startsAt)} ${formatTime(event.startsAt)}`
            : "Date not set"}
        </p>
        <dl className="mt-4 grid gap-2 text-base sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Leave from</dt>
            <dd>
              {origin
                ? `${origin.name} · ${origin.address}`
                : route && !route.origin.ok
                  ? route.origin.problem
                  : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Go to</dt>
            <dd>
              {destination
                ? `${destination.name} · ${destination.address}`
                : route && !route.destination.ok
                  ? route.destination.problem
                  : "—"}
            </dd>
          </div>
        </dl>
        {minutes != null ? (
          <p className="mt-2 text-base">
            About {minutes} min drive{miles ? ` · ${miles} mi` : ""}.
          </p>
        ) : null}
        {frame ? (
          <iframe
            title="Map from the kitchen to the venue"
            className="mt-4 h-96 w-full border border-line"
            src={frame}
          />
        ) : (
          <p className="mt-4 text-base text-ink-2">
            The venue has no map location yet. Add its address on the venue to
            see the map.
          </p>
        )}
        {directions ? (
          <p className="mt-3 text-sm break-all">
            Turn-by-turn directions:{" "}
            <a className="text-link" href={directions}>
              {directions}
            </a>
          </p>
        ) : null}
      </article>
    </div>
  );
}
