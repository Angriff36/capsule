import { formatDate, formatTime } from "../../lib/format";
import { Skeleton } from "../../ui/primitives";
import { eventDetailPath } from "../events/eventRoutes";
import {
  MobileEmpty,
  MobileSectionCard,
} from "../events/mobile/MobileSectionCard";
import { useChatChannelSummary } from "./useTeamChat";

/** Phone overview card: newest channel message and unread count, "Open" → the Chat tab. */
export function MobileEventChatCard({ eventId }: { readonly eventId: string }) {
  const summary = useChatChannelSummary(eventId);
  const caption =
    summary && summary.count > 0
      ? `${summary.count}${summary.countCapped ? "+" : ""} ${
          summary.count === 1 && !summary.countCapped ? "message" : "messages"
        }${summary.unread > 0 ? ` · ${summary.unread} unread` : ""}`
      : undefined;
  return (
    <MobileSectionCard
      id="chat"
      title="Team chat"
      caption={caption}
      seeAllTo={eventDetailPath(eventId, "chat")}
      seeAllLabel="Open"
    >
      {summary === undefined ? (
        <Skeleton className="h-4 w-40" />
      ) : summary === null || summary.count === 0 ? (
        <MobileEmpty>No messages yet. Start the crew conversation.</MobileEmpty>
      ) : (
        <div className="mobile-row">
          <div className="mobile-row-main">
            <span className="block truncate">
              {summary.preview || "Sent a file"}
            </span>
            {summary.lastAt ? (
              <span className="mobile-row-sub">
                {formatDate(summary.lastAt)} {formatTime(summary.lastAt)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </MobileSectionCard>
  );
}
