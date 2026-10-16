import { useMutation } from "convex/react";
import { api, type Doc, type Id } from "../../lib/api";
import {
  countInCourse,
  coursePickText,
  pickState,
  readCoursePicks,
} from "../../lib/coursePicks";
import { formatMoneyExact } from "../../lib/format";
import {
  choiceForPicks,
  hasAutomaticChoices,
  readMenuPricingOptions,
  unitsForGuests,
} from "../../lib/menuPricing";
import { computeLineAmount, type PricingBasis } from "../../lib/pricing";

type Line = Doc<"proposalLineItems">;

export type PickedMenuDish = {
  menuId: string;
  dishId: string;
  course: string | null;
};

/**
 * For each picked menu: how many dishes are picked per course against the
 * menu's pick rules, the price choice the picks call for, the units its
 * guests need ("3 stations"), and the menu's smallest spend with a one-tap
 * top-up line. It warns; it never blocks a pick or a send.
 */
export function ProposalMenuPackageChecks({
  proposalId,
  guestCount,
  menus,
  lines,
  picked,
  draft,
  busy,
  run,
}: {
  proposalId: string;
  guestCount: number;
  menus: Doc<"menus">[];
  lines: Line[];
  picked: PickedMenuDish[];
  draft: boolean;
  busy: boolean;
  run: (key: string, work: () => Promise<void>) => void;
}) {
  const addLine = useMutation(
    api.lib.proposalPricing.addProposalLineAndRecompute,
  );
  const reviseLine = useMutation(
    api.lib.proposalPricing.reviseProposalLineAndRecompute,
  );
  const removeLine = useMutation(
    api.lib.proposalPricing.removeProposalLineAndRecompute,
  );

  const sections = menus
    .map((menu) => {
      const menuId = String(menu._id);
      const options = readMenuPricingOptions(menu);
      const rules = readCoursePicks(menu);
      const mine = picked.filter((row) => row.menuId === menuId);
      const choice = hasAutomaticChoices(options)
        ? choiceForPicks(options, mine)
        : null;
      const units = unitsForGuests(options, guestCount);
      const minimum = options.minimumSpend;
      if (rules.length === 0 && !choice && !units && !minimum) return null;

      const minimumName = minimum ? `${menu.name}: ${minimum.label}` : "";
      // Lines of this menu: linked to it, or named after it (a line built
      // from the event or a website quote carries no menu link).
      const own = lines.filter(
        (line) =>
          String(line.menuId ?? "") === menuId ||
          (line.menuId == null &&
            line.description.startsWith(`${menu.name} (`)),
      );
      const topUp = own.find((line) => line.description === minimumName);
      const spentCents = own
        .filter((line) => line !== topUp)
        .reduce(
          (sum, line) =>
            sum +
            Math.round(
              computeLineAmount(
                {
                  pricingBasis: String(line.pricingBasis) as PricingBasis,
                  unitPrice: Number(line.unitPrice),
                  quantity: Number(line.quantity),
                },
                guestCount,
              ) * 100,
            ),
          0,
        );
      const gap = minimum
        ? Math.max(0, Math.round(minimum.amount * 100) - spentCents) / 100
        : 0;
      const topUpInStep =
        (gap === 0 && !topUp) || (gap > 0 && Number(topUp?.unitPrice) === gap);

      const applyTopUp = () =>
        run(`minimum:${menuId}`, async () => {
          if (gap === 0 && topUp) {
            await removeLine({
              docId: topUp._id,
              version: Number(topUp.version),
            });
          } else if (topUp) {
            await reviseLine({
              docId: topUp._id,
              version: Number(topUp.version),
              description: minimumName,
              pricingBasis: "flat",
              unitPrice: gap,
              quantity: 1,
              sortOrder: Number(topUp.sortOrder),
              notes: topUp.notes ?? undefined,
            });
          } else {
            await addLine({
              proposalId: proposalId as Id<"proposals">,
              description: minimumName,
              pricingBasis: "flat",
              unitPrice: gap,
              sortOrder:
                lines.reduce(
                  (max, row) => Math.max(max, Number(row.sortOrder) || 0),
                  -1,
                ) + 1,
              menuId,
            });
          }
        });

      return (
        <div key={menuId} className="mt-2 text-sm">
          <p className="font-semibold text-ink">{menu.name}</p>
          {rules.length > 0 ? (
            <ul className="mt-1 grid gap-0.5">
              {rules.map((rule) => {
                const count = countInCourse(
                  rule,
                  mine.map((row) => row.course),
                );
                const state = pickState(rule, count);
                return (
                  <li
                    key={rule.course}
                    className={state === "ok" ? "text-ink-2" : "text-warn"}
                  >
                    {rule.course}: {count} picked · {coursePickText(rule)}
                    {state === "ok"
                      ? " ✓"
                      : state === "under"
                        ? ` — pick ${rule.min - count} more`
                        : ` — ${count - rule.max} too many`}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {choice ? (
            <p className="text-ink-2">
              The picks call for {choice.label}:{" "}
              {formatMoneyExact(choice.pricePerPerson)} per guest.
            </p>
          ) : null}
          {units ? <p className="text-ink-2">Needs {units}.</p> : null}
          {minimum ? (
            <p className="flex flex-wrap items-center gap-2">
              <span className={gap > 0 && !topUpInStep ? "text-warn" : ""}>
                {minimum.label}: {formatMoneyExact(minimum.amount)}. On this
                menu now: {formatMoneyExact(spentCents / 100)}
                {gap > 0 ? `, ${formatMoneyExact(gap)} short` : ""}.
              </span>
              {draft && !topUpInStep ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={applyTopUp}
                >
                  {gap === 0
                    ? `Remove ${minimum.label.toLowerCase()} line`
                    : topUp
                      ? `Update to ${formatMoneyExact(gap)}`
                      : `Add ${formatMoneyExact(gap)} ${minimum.label.toLowerCase()}`}
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      );
    })
    .filter(Boolean);

  if (sections.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="eyebrow">Menu rules</p>
      {sections}
    </div>
  );
}
