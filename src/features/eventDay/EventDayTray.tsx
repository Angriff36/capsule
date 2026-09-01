import type { EventDaySectionKey, EventDayTrayItem } from "./eventDayModel";

type Props = {
  readonly now: EventDayTrayItem | null;
  readonly next: EventDayTrayItem | null;
  readonly blockers: readonly EventDayTrayItem[];
  readonly onOpen: (key: EventDaySectionKey) => void;
};

function Cell({
  head,
  dotColor,
  item,
  empty,
  extra,
  onOpen,
}: {
  readonly head: string;
  readonly dotColor: string;
  readonly item: EventDayTrayItem | null;
  readonly empty: string;
  readonly extra?: number;
  readonly onOpen: (key: EventDaySectionKey) => void;
}) {
  return (
    <button
      type="button"
      className="evd-tray-cell"
      disabled={item == null}
      onClick={() => item && onOpen(item.key)}
    >
      <span className="evd-tray-head" style={{ color: dotColor }}>
        <span className="evd-tray-dot" style={{ background: dotColor }} />
        {head}
      </span>
      {item ? (
        <>
          <p className="evd-tray-label">
            {item.label}
            {extra != null && extra > 0 ? ` +${extra}` : ""}
          </p>
          <p className="evd-tray-sub">{item.caption}</p>
        </>
      ) : (
        <p className="evd-tray-sub" style={{ marginTop: "0.35rem" }}>
          {empty}
        </p>
      )}
    </button>
  );
}

/** Now / Next / Blockers shelf under the map. */
export function EventDayTray({ now, next, blockers, onOpen }: Props) {
  return (
    <div className="evd-tray">
      <Cell
        head="Now"
        dotColor="var(--evd-ready)"
        item={now}
        empty="All settled"
        onOpen={onOpen}
      />
      <Cell
        head="Next"
        dotColor="var(--evd-active)"
        item={next}
        empty="Nothing queued"
        onOpen={onOpen}
      />
      <Cell
        head="Blockers"
        dotColor="var(--evd-blocked)"
        item={blockers[0] ?? null}
        empty="None"
        extra={blockers.length - 1}
        onOpen={onOpen}
      />
    </div>
  );
}
