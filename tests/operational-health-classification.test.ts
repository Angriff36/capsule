// PL-MONITORING (AC-165): the health list names failed deploys, a server that
// does not answer, stuck / stopped / uncertain outside messages and broken
// connections, each with a next step, and never shows provider error text.
import { describe, expect, it } from "vitest";
import {
  classifyHealth,
  STUCK_AFTER_MS,
  type HealthSnapshot,
} from "../src/lib/operationalHealth";

const NOW = Date.UTC(2026, 9, 2, 12);
const SHA = "a".repeat(40);

function snapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    now: NOW,
    pageBuild: SHA,
    backend: { releaseSha: SHA },
    messages: [
      {
        channel: "webhooks",
        label: "Webhooks",
        waiting: 0,
        oldestWaitingSince: null,
        stopped: 0,
        notSure: 0,
      },
    ],
    calendar: { state: "in_step", failedCount: 0 },
    quickBooks: { connected: true, lastStatus: "ok", failed: 0 },
    ...overrides,
  };
}

const keys = (snap: HealthSnapshot) => classifyHealth(snap).map((a) => a.key);

describe("operational health classification", () => {
  it("says nothing when everything is healthy or still loading", () => {
    expect(classifyHealth(snapshot())).toEqual([]);
    expect(
      classifyHealth(
        snapshot({
          backend: undefined,
          messages: undefined,
          calendar: undefined,
          quickBooks: undefined,
        }),
      ),
    ).toEqual([]);
  });

  it("names a server that does not answer, a hand deploy and a version gap", () => {
    expect(keys(snapshot({ backend: null }))).toEqual(["server-down"]);
    expect(classifyHealth(snapshot({ backend: null }))[0].level).toBe("act");
    expect(keys(snapshot({ backend: { releaseSha: "unreleased" } }))).toEqual([
      "server-hand-deployed",
    ]);
    const gap = classifyHealth(
      snapshot({ backend: { releaseSha: "b".repeat(40) } }),
    );
    expect(gap.map((a) => a.key)).toEqual(["server-version-differs"]);
    expect(gap[0].detail).toContain("aaaaaaa");
    expect(gap[0].detail).toContain("bbbbbbb");
    // A local build has no commit: no version claim either way.
    expect(
      keys(
        snapshot({ pageBuild: null, backend: { releaseSha: "c".repeat(40) } }),
      ),
    ).toEqual([]);
  });

  it("keeps stuck, stopped and not-sure messages apart", () => {
    const base = snapshot().messages![0];
    const slow = snapshot({
      messages: [{ ...base, waiting: 2, oldestWaitingSince: NOW - 60_000 }],
    });
    expect(keys(slow)).toEqual([]);
    const stuck = snapshot({
      messages: [
        {
          ...base,
          waiting: 2,
          oldestWaitingSince: NOW - STUCK_AFTER_MS - 60_000,
          stopped: 1,
          notSure: 3,
        },
      ],
    });
    const alerts = classifyHealth(stuck);
    expect(alerts.map((a) => [a.key, a.level])).toEqual([
      ["webhooks-stuck", "act"],
      ["webhooks-stopped", "act"],
      ["webhooks-not-sure", "check"],
    ]);
    expect(alerts[1].title).toBe("Capsule stopped trying 1 webhook");
    expect(alerts[2].title).toBe("Not sure 3 webhooks arrived");
    expect(alerts[2].action).toMatch(/check the other system first/i);
  });

  it("names broken and partly failed connections", () => {
    expect(
      keys(
        snapshot({ calendar: { state: "needs_reconnect", failedCount: 4 } }),
      ),
    ).toEqual(["calendar-reconnect"]);
    expect(
      keys(
        snapshot({ calendar: { state: "needs_attention", failedCount: 2 } }),
      ),
    ).toEqual(["calendar-failed"]);
    expect(
      keys(
        snapshot({
          quickBooks: {
            connected: true,
            lastStatus: "needs_reconnect",
            failed: 0,
          },
        }),
      ),
    ).toEqual(["quickbooks-reconnect"]);
    expect(
      keys(
        snapshot({
          quickBooks: { connected: true, lastStatus: "partial", failed: 2 },
        }),
      ),
    ).toEqual(["quickbooks-partial"]);
    // Not connected is a choice, not a fault.
    expect(
      keys(
        snapshot({
          calendar: { state: "not_connected", failedCount: 0 },
          quickBooks: {
            connected: false,
            lastStatus: "disconnected",
            failed: 0,
          },
        }),
      ),
    ).toEqual([]);
  });

  it("lists action items first and every alert has a next step", () => {
    const alerts = classifyHealth(
      snapshot({
        backend: { releaseSha: "unreleased" },
        calendar: { state: "needs_reconnect", failedCount: 0 },
      }),
    );
    expect(alerts.map((a) => a.level)).toEqual(["act", "check"]);
    for (const alert of alerts) expect(alert.action.length).toBeGreaterThan(10);
  });

  it("only takes counts and states, so no secret can reach the text", () => {
    const secret = "sk_live_SECRET123";
    const alerts = classifyHealth(
      snapshot({
        backend: null,
        messages: [
          {
            channel: "texts",
            label: "Text alerts",
            waiting: 1,
            oldestWaitingSince: NOW - 2 * STUCK_AFTER_MS,
            stopped: 1,
            notSure: 1,
          },
        ],
        calendar: { state: "needs_attention", failedCount: 1 },
        quickBooks: { connected: true, lastStatus: "partial", failed: 1 },
      }),
    );
    expect(alerts.length).toBeGreaterThan(4);
    expect(JSON.stringify(alerts)).not.toContain(secret);
    expect(JSON.stringify(alerts)).not.toMatch(/token|password|sk_/i);
  });
});
