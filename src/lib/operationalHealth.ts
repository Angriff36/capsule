// PL-MONITORING (AC-165): one answer to "is anything wrong with Capsule right
// now, and what do I do about it?" for a manager.
//
// Pure module — no I/O. The health section feeds it what the existing reads
// already say (deploymentProbe:health, deliveryHealth:outsideMessageHealth,
// googleCalendarHealth:connectionHealth, qboSync:getConnectionStatus) and the
// commit this page was built from. Every read is already limited to the
// manager's own company, so one company's stuck work never shows to another.
//
// It takes counts and states only, never provider error text, so no token,
// key or address can reach the screen through an alert.
//
// "Not sure it arrived" is kept apart from "stopped trying": a message Capsule
// is not sure about may already be with the customer, so the advice is to
// check before sending again; a stopped one surely did not arrive.
//
// A connection whose access ends on a known date (QuickBooks always says;
// Google says only for time-limited access) is flagged 14 days ahead, so a
// manager reconnects before sending stops.

export type HealthLevel = "act" | "check";

export interface HealthAlert {
  key: string;
  level: HealthLevel;
  title: string;
  detail: string;
  /** What to do now, in order. Points at the runbook for the hard cases. */
  action: string;
}

export interface MessageChannelSnapshot {
  channel: string;
  label: string;
  waiting: number;
  oldestWaitingSince: number | null;
  stopped: number;
  notSure: number;
  /** Phone alerts only: who owns the phones that missed the last alert. */
  missedBy?: string[];
}

export interface HealthSnapshot {
  now: number;
  /** Commit this page was built from; null for a local build. */
  pageBuild: string | null;
  /** undefined = still asking; null = the server did not answer. */
  backend: { releaseSha: string } | null | undefined;
  /** null = not shown to this person (not a manager). */
  messages: MessageChannelSnapshot[] | null | undefined;
  calendar:
    | {
        state: string;
        failedCount: number;
        /** When Google stops accepting Capsule's access; null = Google did not say. */
        accessEndsAt?: number | null;
      }
    | null
    | undefined;
  quickBooks:
    | {
        connected: boolean;
        lastStatus: string | null;
        failed: number;
        /** When QuickBooks stops accepting Capsule's access; null = it did not say. */
        accessEndsAt?: number | null;
      }
    | null
    | undefined;
}

/** Waiting longer than this is stuck, not slow (retries run within minutes). */
export const STUCK_AFTER_MS = 30 * 60_000;

/** A connection whose access ends within this is flagged, so someone reconnects in time. */
export const ACCESS_ENDING_WITHIN_MS = 14 * 24 * 60 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

const RUNBOOK = 'See "Health and recovery" in the operations guide.';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function serverAlerts(snapshot: HealthSnapshot): HealthAlert[] {
  const { backend, pageBuild } = snapshot;
  if (backend === undefined) return [];
  if (backend === null) {
    return [
      {
        key: "server-down",
        level: "act",
        title: "Capsule's server is not answering",
        detail:
          "Screens can open, but nothing can be saved or loaded until the server answers again.",
        action:
          "Forms you are typing in are kept on this device. Wait a few minutes and reload. If it lasts, restart the server on the production computer. " +
          RUNBOOK,
      },
    ];
  }
  if (backend.releaseSha === "unreleased") {
    return [
      {
        key: "server-hand-deployed",
        level: "check",
        title: "The server was set up by hand, not from a release",
        detail: "Nobody can say which version of Capsule's server is running.",
        action: `Run the normal production release so the server matches a known version. ${RUNBOOK}`,
      },
    ];
  }
  if (pageBuild && backend.releaseSha !== pageBuild) {
    return [
      {
        key: "server-version-differs",
        level: "check",
        title: "Screens and server come from different releases",
        detail: `Screens ${pageBuild.slice(0, 7)}, server ${backend.releaseSha.slice(0, 7)}. This is normal when the newest release changed screens only.`,
        action: `If buttons fail with "not found" errors, the server part of the last release did not finish: run the production release again. ${RUNBOOK}`,
      },
    ];
  }
  return [];
}

function messageAlerts(snapshot: HealthSnapshot): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  for (const channel of snapshot.messages ?? []) {
    if (
      channel.oldestWaitingSince != null &&
      snapshot.now - channel.oldestWaitingSince > STUCK_AFTER_MS
    ) {
      alerts.push({
        key: `${channel.channel}-stuck`,
        level: "act",
        title: `${channel.label} are stuck`,
        detail: `${plural(channel.waiting, "is", "are")} waiting; the oldest has waited over ${Math.floor(
          (snapshot.now - channel.oldestWaitingSince) / 60_000,
        )} minutes.`,
        action: `Check the connection for ${channel.label.toLowerCase()} below. Capsule keeps trying by itself; nothing is lost while it waits. ${RUNBOOK}`,
      });
    }
    if (channel.channel === "phoneAlerts") {
      // Counted per phone. A "check", not a bell item: one lost or switched-off
      // phone must not ring every manager's bell until someone deals with it.
      if (channel.stopped > 0) {
        const who = channel.missedBy?.length
          ? ` Phones of: ${channel.missedBy.join(", ")}.`
          : "";
        alerts.push({
          key: "phoneAlerts-missed",
          level: "check",
          title: `${plural(channel.stopped, "phone", "phones")} did not get the last alert`,
          detail: `Shift, chat and run-of-show alerts are not reaching ${channel.stopped === 1 ? "this phone" : "these phones"}. Everything still shows when the person opens Capsule.${who}`,
          action:
            "Ask the person to open Capsule on that phone and turn phone alerts off and on again. If every phone misses alerts, check the phone alert keys on the server. " +
            RUNBOOK,
        });
      }
      continue;
    }
    if (channel.stopped > 0) {
      alerts.push({
        key: `${channel.channel}-stopped`,
        level: "act",
        title: `Capsule stopped trying ${plural(channel.stopped, channel.label.toLowerCase().replace(/s$/, ""), channel.label.toLowerCase())}`,
        detail: "These did not arrive.",
        action:
          channel.channel === "webhooks"
            ? "Fix the cause (wrong address, switched-off receiver), then use Try again in the Webhooks list below."
            : "Fix the cause (wrong number or address, switched-off connection), then send them again from where they started.",
      });
    }
    if (channel.notSure > 0) {
      alerts.push({
        key: `${channel.channel}-not-sure`,
        level: "check",
        title: `Not sure ${plural(channel.notSure, channel.label.toLowerCase().replace(/s$/, ""), channel.label.toLowerCase())} arrived`,
        detail:
          "The other side may already have them. Sending again could send twice.",
        action:
          "Ask the person or check the other system first; send again only if it did not arrive.",
      });
    }
  }
  return alerts;
}

function accessEndingAlert(
  now: number,
  accessEndsAt: number | null | undefined,
  key: string,
  name: string,
  action: string,
): HealthAlert[] {
  if (accessEndsAt == null || accessEndsAt - now > ACCESS_ENDING_WITHIN_MS) {
    return [];
  }
  const days = Math.ceil((accessEndsAt - now) / DAY_MS);
  const when =
    days <= 0
      ? "has ended"
      : days === 1
        ? "ends tomorrow"
        : `ends in ${days} days`;
  return [
    {
      key,
      level: "act",
      title: `${name} access ${when}`,
      detail: `${name} gave Capsule access for a fixed time. When it ends, nothing more is sent to ${name} until someone connects it again.`,
      action,
    },
  ];
}

function connectionAlerts(snapshot: HealthSnapshot): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const { calendar, quickBooks } = snapshot;
  if (calendar && calendar.state !== "needs_reconnect") {
    alerts.push(
      ...accessEndingAlert(
        snapshot.now,
        calendar.accessEndsAt,
        "calendar-access-ending",
        "Google Calendar",
        "Use Connect under Google Calendar below before then. Events catch up by themselves after that.",
      ),
    );
  }
  if (quickBooks?.connected && quickBooks.lastStatus !== "needs_reconnect") {
    alerts.push(
      ...accessEndingAlert(
        snapshot.now,
        quickBooks.accessEndsAt,
        "quickbooks-access-ending",
        "QuickBooks",
        "Disconnect and connect QuickBooks again below before then. Items already in QuickBooks are not sent twice.",
      ),
    );
  }
  if (calendar?.state === "needs_reconnect") {
    alerts.push({
      key: "calendar-reconnect",
      level: "act",
      title: "Google Calendar needs to be connected again",
      detail:
        "Google stopped accepting Capsule's access. Events are not being sent.",
      action:
        "Use Connect under Google Calendar below. Events catch up by themselves after that.",
    });
  } else if (calendar?.state === "needs_attention") {
    alerts.push({
      key: "calendar-failed",
      level: "check",
      title: "Some events did not reach Google Calendar",
      detail:
        calendar.failedCount > 0
          ? `${plural(calendar.failedCount, "event was", "events were")} not accepted.`
          : "The last calendar run did not finish every event.",
      action: "Retry each event from the Google Calendar list below.",
    });
  }
  if (quickBooks?.connected && quickBooks.lastStatus === "needs_reconnect") {
    alerts.push({
      key: "quickbooks-reconnect",
      level: "act",
      title: "QuickBooks needs to be connected again",
      detail:
        "QuickBooks stopped accepting Capsule's access. Nothing is being sent to it.",
      action: "Disconnect and connect QuickBooks again below.",
    });
  } else if (
    quickBooks?.connected &&
    (quickBooks.lastStatus === "partial" || quickBooks.failed > 0)
  ) {
    alerts.push({
      key: "quickbooks-partial",
      level: "check",
      title: "The last QuickBooks run did not send everything",
      detail: `${plural(quickBooks.failed, "item", "items")} did not go through.`,
      action:
        "Use Sync now below. Items already in QuickBooks are not sent twice.",
    });
  }
  return alerts;
}

/** Every problem, "act" ones first. Empty = nothing wrong that Capsule can see. */
export function classifyHealth(snapshot: HealthSnapshot): HealthAlert[] {
  const alerts = [
    ...serverAlerts(snapshot),
    ...messageAlerts(snapshot),
    ...connectionAlerts(snapshot),
  ];
  return [
    ...alerts.filter((alert) => alert.level === "act"),
    ...alerts.filter((alert) => alert.level === "check"),
  ];
}
