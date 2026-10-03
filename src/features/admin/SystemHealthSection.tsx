import { useConvexConnectionState, useQuery } from "convex/react";
import { RUNNING_BUILD } from "../../app/shell/newVersion";
import { api } from "../../lib/api";
import { classifyHealth } from "../../lib/operationalHealth";
import { Section } from "../../ui/primitives";

/**
 * PL-MONITORING (AC-165): what is wrong with Capsule right now and what to do
 * about it — the server, stuck or stopped outside messages, and broken
 * connections — in one list at the top of Integrations. Managers only.
 */
export function SystemHealthSection({ canManage }: { canManage: boolean }) {
  const backend = useQuery(api.deploymentProbe.health, {});
  const messages = useQuery(api.deliveryHealth.outsideMessageHealth, {});
  const calendar = useQuery(api.googleCalendarHealth.connectionHealth, {});
  const quickBooks = useQuery(api.qboSync.getConnectionStatus, {});
  const connection = useConvexConnectionState();
  if (!canManage) return null;

  const serverDown =
    !connection.isWebSocketConnected && connection.connectionRetries > 0;
  const alerts = classifyHealth({
    now: Date.now(),
    pageBuild: RUNNING_BUILD,
    backend: serverDown ? null : backend,
    messages,
    calendar: calendar && {
      state: calendar.state,
      failedCount: calendar.failed.length,
    },
    quickBooks: quickBooks && {
      connected: quickBooks.connected,
      lastStatus: quickBooks.lastSync?.status ?? null,
      failed: quickBooks.lastSync?.failed ?? 0,
    },
  });

  return (
    <Section title="System health" count={alerts.length || undefined}>
      <div className="p-4">
        {alerts.length === 0 ? (
          <p className="text-sm text-ink-3">
            Nothing needs attention. The server answers, outside messages are
            moving and connections work.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {alerts.map((alert) => (
              <li key={alert.key} className="space-y-1 py-2">
                <p
                  className={
                    alert.level === "act"
                      ? "font-medium text-danger"
                      : "font-medium text-warn"
                  }
                >
                  {alert.level === "act" ? "Needs action: " : "Check: "}
                  {alert.title}
                </p>
                <p className="text-ink-2">{alert.detail}</p>
                <p className="text-ink">{alert.action}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
