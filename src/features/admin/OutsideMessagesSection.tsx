import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { Section, Skeleton } from "../../ui/primitives";

function waitedFor(since: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - since) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

/** Phone alerts are counted per phone: did its last alert arrive? */
function phoneAlertsLine(channel: {
  delivered: number;
  stopped: number;
  missedBy?: string[];
}): string {
  const phones = (count: number) =>
    `${count} ${count === 1 ? "phone" : "phones"}`;
  const parts = [`${phones(channel.delivered)} getting alerts`];
  if (channel.stopped > 0) {
    parts.push(
      `${phones(channel.stopped)} missed the last alert${
        channel.missedBy?.length ? ` (${channel.missedBy.join(", ")})` : ""
      }`,
    );
  }
  return parts.join(" · ");
}

/**
 * How Capsule's outside messages are doing: waiting, stopped and "not sure"
 * counts per kind, so a stuck webhook, text or sign-in email is seen.
 */
export function OutsideMessagesSection() {
  const health = useQuery(api.deliveryHealth.outsideMessageHealth, {});
  if (health === null) return null;
  return (
    <Section title="Outside messages">
      <div className="p-4">
        {health === undefined ? (
          <Skeleton className="h-6" />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {health.map((channel) => {
              const problems = channel.stopped + channel.notSure;
              return (
                <li
                  key={channel.channel}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="font-medium text-ink">{channel.label}</span>
                  <span className={problems > 0 ? "text-danger" : "text-ink-3"}>
                    {channel.channel === "phoneAlerts"
                      ? phoneAlertsLine(channel)
                      : [
                          `${channel.delivered} delivered`,
                          channel.waiting > 0
                            ? `${channel.waiting} waiting${
                                channel.oldestWaitingSince != null
                                  ? ` (oldest ${waitedFor(channel.oldestWaitingSince)})`
                                  : ""
                              }`
                            : null,
                          channel.stopped > 0
                            ? `${channel.stopped} stopped trying`
                            : null,
                          channel.notSure > 0
                            ? `${channel.notSure} not sure they arrived`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}
