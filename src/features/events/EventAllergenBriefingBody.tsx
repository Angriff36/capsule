import { useMemo } from "react";
import {
  useListDish,
  useListEventGuest,
} from "../../lib/manifest-convex-react";
import { useEventMenuLines } from "../../lib/useEventMenuLines";
import { TableSkeleton } from "../../ui/primitives";
import { displayEventMenuNotes } from "./eventMenuLineFields";
import {
  assessGuestListCoverage,
  GuestListCoverageNotice,
} from "./GuestListCoverageNotice";
import { guestTableLabel } from "./guestTableLabel";

const allergenLabel = (value: string) => value.replaceAll("_", " ");
const normalize = (value: string) =>
  value.replaceAll("_", " ").trim().toLowerCase();

/**
 * The allergen briefing itself: the watch list (guest allergen on a menu
 * dish), every dish with its allergens, and guest restrictions. Shared by the
 * print page and the pop-up panel on the event page.
 */
export function EventAllergenBriefingBody({
  eventId,
  expectedHeadcount,
}: {
  readonly eventId: string;
  readonly expectedHeadcount?: number | null;
}) {
  const allEventDishes = useEventMenuLines(eventId);
  const eventDishes = useMemo(
    () => allEventDishes?.filter((d) => d.eventId === eventId),
    [allEventDishes, eventId],
  );
  const allEventGuests = useListEventGuest();
  const eventGuests = useMemo(
    () => allEventGuests?.filter((g) => g.eventId === eventId),
    [allEventGuests, eventId],
  );
  const dishes = useListDish();

  const menu = useMemo(() => {
    const dishById = new Map((dishes ?? []).map((dish) => [dish._id, dish]));
    return (eventDishes ?? [])
      .filter((row) => row.removedAt == null && row.deletedAt == null)
      .map((row) => ({ row, dish: dishById.get(row.dishId) }))
      .sort((left, right) =>
        `${left.row.course ?? ""} ${left.dish?.name ?? ""}`.localeCompare(
          `${right.row.course ?? ""} ${right.dish?.name ?? ""}`,
        ),
      );
  }, [eventDishes, dishes]);

  // All recorded guests (any RSVP state) — the denominator the coverage
  // warning compares against the sold headcount.
  const invitedGuestCount = useMemo(
    () =>
      (eventGuests ?? []).filter(
        (guest) => guest.invitedAt != null && guest.deletedAt == null,
      ).length,
    [eventGuests],
  );

  const flaggedGuests = useMemo(
    () =>
      (eventGuests ?? [])
        .filter(
          (guest) =>
            guest.invitedAt != null &&
            guest.deletedAt == null &&
            guest.rsvpStatus !== "declined" &&
            (guest.dietaryRestrictions?.length ||
              guest.allergenRestrictions?.length ||
              guest.specialMealRequired),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [eventGuests],
  );

  // Guest-declared allergens that appear on a menu dish — the watch list.
  const conflicts = useMemo(() => {
    const results: { guestName: string; allergen: string; dishes: string[] }[] =
      [];
    for (const guest of flaggedGuests) {
      for (const restriction of guest.allergenRestrictions ?? []) {
        const wanted = normalize(restriction);
        if (!wanted) continue;
        const hits = menu
          .filter((item) =>
            (item.dish?.allergenSummary ?? []).some((allergen: string) => {
              const present = normalize(allergen);
              return present === wanted || wanted.includes(present);
            }),
          )
          .map((item) => item.dish?.name ?? "Unknown dish");
        if (hits.length) {
          results.push({
            guestName: guest.name,
            allergen: restriction,
            dishes: hits,
          });
        }
      }
    }
    return results;
  }, [flaggedGuests, menu]);

  if (
    eventDishes === undefined ||
    eventGuests === undefined ||
    dishes === undefined
  ) {
    return <TableSkeleton rows={4} />;
  }

  const guestListCoverage = assessGuestListCoverage(
    invitedGuestCount,
    expectedHeadcount,
  );

  return (
    <>
      <div className="mt-4 empty:hidden">
        <GuestListCoverageNotice coverage={guestListCoverage} />
      </div>
      {conflicts.length ? (
        <section className="mt-6 break-inside-avoid rounded-xs border border-warn/40 bg-warn-soft/50 p-3">
          <h2 className="text-base font-semibold uppercase tracking-wide">
            Watch list — guest allergen on the menu
          </h2>
          <ul className="mt-2 space-y-1 text-base">
            {conflicts.map((conflict, index) => (
              <li key={index}>
                <strong>{conflict.guestName}</strong> — {conflict.allergen}{" "}
                appears in: {conflict.dishes.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 break-inside-avoid">
        <h2 className="border-b border-line-2 pb-1 text-base font-semibold uppercase tracking-wide">
          Menu &amp; allergens
        </h2>
        {menu.length === 0 ? (
          <p className="mt-2 text-base text-ink-2">
            No dishes are on this event&rsquo;s menu yet.
          </p>
        ) : (
          <table className="mt-2 w-full text-left text-base">
            <thead>
              <tr className="border-b border-line-2 text-xs uppercase tracking-wide text-ink-2">
                <th className="py-1 pr-3 font-medium">Course</th>
                <th className="py-1 pr-3 font-medium">Dish</th>
                <th className="py-1 pr-3 font-medium">Allergens</th>
                <th className="py-1 font-medium">Dietary tags</th>
              </tr>
            </thead>
            <tbody>
              {menu.map(({ row, dish }) => (
                <tr key={row._id} className="border-b border-line align-top">
                  <td className="py-1.5 pr-3 capitalize text-ink-2">
                    {row.course ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    {dish?.name ?? "Unknown dish"}
                    {displayEventMenuNotes(row.specialInstructions) ? (
                      <span className="block text-xs text-ink-2">
                        {displayEventMenuNotes(row.specialInstructions)}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 capitalize">
                    {dish?.allergenSummary?.length
                      ? dish.allergenSummary.map(allergenLabel).join(", ")
                      : "None declared"}
                  </td>
                  <td className="py-1.5 capitalize text-ink-2">
                    {dish?.dietaryTags?.length
                      ? dish.dietaryTags.join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 break-inside-avoid">
        <h2 className="border-b border-line-2 pb-1 text-base font-semibold uppercase tracking-wide">
          Guest dietary restrictions
        </h2>
        {flaggedGuests.length === 0 ? (
          // When the guest list itself is empty or sparse, "no
          // restrictions captured" would read as "no allergies exist".
          // Say the truth instead: restrictions are unknown, not absent.
          guestListCoverage != null ? (
            <p className="mt-2 text-base text-ink-2">
              {guestListCoverage.severity === "empty"
                ? "No guests are on the list for this event, so dietary restrictions are unknown — not absent. Fill in the Guests tab before relying on this briefing."
                : `Only ${guestListCoverage.guestCount} of ${guestListCoverage.expectedHeadcount} expected guests are on the list, and none list restrictions so far. Restrictions for the missing guests are unknown — not absent.`}
            </p>
          ) : (
            <p className="mt-2 text-base text-ink-2">
              {
                "No guest dietary restrictions were captured at booking. Add them on the event’s Guests tab as RSVPs come in."
              }
            </p>
          )
        ) : (
          <ul className="mt-2 space-y-1.5 text-base">
            {flaggedGuests.map((guest) => (
              <li key={guest._id}>
                <strong>{guest.name}</strong>
                {guest.tableAssignment
                  ? ` (${guestTableLabel(guest.tableAssignment)})`
                  : ""}
                {guest.specialMealRequired ? (
                  <span className="ml-1.5 text-warn">
                    Special meal required
                  </span>
                ) : null}
                <span className="block text-ink-2">
                  {[
                    ...(guest.allergenRestrictions ?? []).map(
                      (item: string) => `Allergen: ${item}`,
                    ),
                    ...(guest.dietaryRestrictions ?? []),
                  ].join(" · ") || "Special meal only"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
