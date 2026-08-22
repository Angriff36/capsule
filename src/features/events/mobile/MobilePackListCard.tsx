import { useState } from "react";
import {
  useListPackList,
  useListPackListItem,
  usePackListItemMarkPacked,
} from "../../../lib/manifest-convex-react";
import { StatusChip } from "../../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";
import { formatQuantity } from "./formatQuantity";
import { MobileEmpty, MobileSectionCard } from "./MobileSectionCard";

type PackListItem = NonNullable<ReturnType<typeof useListPackListItem>>[number];

/** Pack lists for this event; each listed item can be checked off as packed. */
export function MobilePackListCard({ eventId }: { readonly eventId: string }) {
  const lists = useListPackList();
  const items = useListPackListItem();
  const markPacked = usePackListItemMarkPacked();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const eventLists = (lists ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      row.status !== "cancelled",
  );
  const first = eventLists[0];
  const allItems = (items ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      eventLists.some((list) => list._id === row.packListId),
  );
  const packed = allItems.filter((row) => row.status === "packed").length;

  const check = async (item: PackListItem) => {
    setFailure(null);
    setBusy(item._id);
    try {
      await markPacked({
        docId: item._id,
        version: item.version,
        packedQuantity: Number(item.requiredQuantity) || 1,
      });
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <MobileSectionCard
      id="pack"
      title="Pack list"
      caption={
        allItems.length > 0
          ? `${packed} of ${allItems.length} packed`
          : undefined
      }
      seeAllTo={first ? `/logistics/packs/${first._id}` : "/logistics/packs"}
    >
      {failure ? <FailureBanner failure={failure} /> : null}
      {eventLists.length === 0 ? (
        <MobileEmpty>No pack list for this event yet.</MobileEmpty>
      ) : (
        eventLists.map((list) => {
          const listItems = allItems.filter(
            (row) => row.packListId === list._id,
          );
          const draft = list.status === "draft";
          return (
            <div key={list._id} className="pt-2">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow truncate">{list.name || "Pack list"}</p>
                <StatusChip status={String(list.status)} />
              </div>
              {draft ? (
                <p className="text-sm text-ink-3">
                  Still a draft — start packing in Logistics to check items off.
                </p>
              ) : null}
              {listItems.length === 0 ? (
                <MobileEmpty>No items listed.</MobileEmpty>
              ) : (
                listItems.map((item) => {
                  const isPacked = item.status === "packed";
                  const canPack = item.status === "listed" && !draft;
                  const quantity = Number(item.requiredQuantity) || 0;
                  return (
                    <label key={item._id} className="mobile-row cursor-pointer">
                      <input
                        type="checkbox"
                        className="mobile-check"
                        checked={isPacked}
                        disabled={!canPack || busy != null}
                        onChange={() => void check(item)}
                        aria-label={`Packed: ${item.description}`}
                      />
                      <span className="mobile-row-main">
                        <span
                          className={`block truncate ${isPacked ? "text-ink-3 line-through" : ""}`}
                        >
                          {item.description}
                        </span>
                        <span className="mobile-row-sub truncate">
                          {quantity > 0
                            ? `${formatQuantity(quantity)} ${String(item.unit)}`
                            : ""}
                          {item.status === "missing" ? " · missing" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          );
        })
      )}
    </MobileSectionCard>
  );
}
