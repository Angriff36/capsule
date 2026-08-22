import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "../../../ui/icons";
import { StatusChip } from "../../../ui/primitives";

type Props = {
  readonly title: string;
  readonly stage: string;
};

/** Sticky phone header for the event page: back, title, stage. */
export function MobileEventHeader({ title, stage }: Props) {
  return (
    <div className="mobile-event-header flex items-center gap-2">
      <Link
        to="/events"
        aria-label="All events"
        className="grid h-11 w-11 shrink-0 place-items-center text-ink-2"
      >
        <ArrowLeftIcon width={18} height={18} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
        {title}
      </h1>
      <StatusChip status={stage} />
    </div>
  );
}
