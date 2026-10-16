import { useMutation } from "convex/react";
import { api, type Doc, type Id } from "../../lib/api";
import {
  addOnText,
  menuMoney,
  perGuestPriceText,
  priceStepFor,
  readMenuPricingOptions,
  type MenuAddOn,
  type MenuPricingOptions,
} from "../../lib/menuPricing";
import { useActionPrompt } from "../../ui/action-prompt";

type Line = Doc<"proposalLineItems">;

/**
 * A draft proposal's price options for each picked menu that has them
 * (src/lib/menuPricing.ts): pick a price choice, add an add-on, or charge the
 * menu by its price table. Each tap writes one price line through the
 * governed proposal line seams, so the totals recompute at once.
 */
export function ProposalMenuPriceOptions({
  proposalId,
  guestCount,
  menus,
  lines,
  busy,
  run,
}: {
  proposalId: string;
  guestCount: number;
  /** The menus with a dish picked on this proposal. */
  menus: Doc<"menus">[];
  /** This proposal's live price lines. */
  lines: Line[];
  busy: boolean;
  run: (key: string, work: () => Promise<void>) => void;
}) {
  const addLine = useMutation(
    api.lib.proposalPricing.addProposalLineAndRecompute,
  );
  const reviseLine = useMutation(
    api.lib.proposalPricing.reviseProposalLineAndRecompute,
  );
  const { prompt, host } = useActionPrompt();
  const priced = menus
    .map((menu) => ({ menu, options: readMenuPricingOptions(menu) }))
    .filter(
      ({ options }) =>
        options.priceTo != null ||
        options.choices.length > 0 ||
        options.addOns.length > 0 ||
        options.steps.length > 0,
    );
  if (priced.length === 0) return null;

  const nextSortOrder = () =>
    lines.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), -1) +
    1;

  // Change a line's price and name; every other field is sent as stored,
  // because an omitted field is cleared.
  const revise = (line: Line, change: Partial<Line>) =>
    reviseLine({
      docId: line._id,
      version: Number(line.version),
      description: change.description ?? line.description,
      pricingBasis: String(change.pricingBasis ?? line.pricingBasis),
      unitPrice: Number(change.unitPrice ?? line.unitPrice),
      quantity: Number(change.quantity ?? line.quantity),
      unit: (change.unit ?? line.unit) || undefined,
      sortOrder: Number(line.sortOrder),
      notes: line.notes ?? undefined,
      menuDishId: (line.menuDishId ?? undefined) as
        Id<"menuDishes"> | undefined,
      overrideReason: line.overrideReason ?? undefined,
      equipmentId: (line.equipmentId ?? undefined) as
        Id<"equipments"> | undefined,
      feePercent: line.feePercent == null ? undefined : Number(line.feePercent),
      feeAppliesTo: line.feeAppliesTo ?? undefined,
    });

  const askCount = async (title: string, unit: string) => {
    const values = await prompt.askFields({
      title,
      description: `How many ${unit}?`,
      confirmLabel: "Add to price",
      fields: [
        {
          name: "count",
          label: `Number of ${unit}`,
          inputType: "number",
          required: true,
        },
      ],
    });
    const count = Number(values?.count);
    return count > 0 ? count : null;
  };

  const menuSection = (menu: Doc<"menus">, options: MenuPricingOptions) => {
    const menuId = String(menu._id);
    const own = lines.filter((line) => String(line.menuId ?? "") === menuId);
    const perGuestLine = own.find(
      (line) =>
        String(line.pricingBasis) === "per_person" &&
        line.description.startsWith(`${menu.name} (per `),
    );
    const stepLine = own.find(
      (line) => String(line.pricingBasis) === "package",
    );
    const range = perGuestPriceText(Number(menu.pricePerPerson), options);
    const choices = [
      ...(Number(menu.pricePerPerson) > 0
        ? [{ label: "", pricePerPerson: Number(menu.pricePerPerson) }]
        : []),
      ...options.choices,
    ];

    const pickChoice = (label: string, price: number) =>
      run(`choice:${menuId}:${label}`, async () => {
        const description = label
          ? `${menu.name} (per guest) — ${label}`
          : `${menu.name} (per guest)`;
        if (perGuestLine)
          await revise(perGuestLine, { description, unitPrice: price });
        else
          await addLine({
            proposalId: proposalId as Id<"proposals">,
            description,
            pricingBasis: "per_person",
            unitPrice: price,
            sortOrder: nextSortOrder(),
            menuId,
          });
      });

    const addOnLine = (addOn: MenuAddOn) =>
      own.find((line) => line.description === `${menu.name}: ${addOn.label}`);
    const addAddOn = (addOn: MenuAddOn) =>
      run(`addon:${menuId}:${addOn.label}`, async () => {
        const description = `${menu.name}: ${addOn.label}`;
        if (addOn.per === "guest") {
          await addLine({
            proposalId: proposalId as Id<"proposals">,
            description,
            pricingBasis: "per_person",
            unitPrice: addOn.price,
            sortOrder: nextSortOrder(),
            menuId,
          });
          return;
        }
        const count = await askCount(description, `${addOn.per}s`);
        if (count == null) return;
        await addLine({
          proposalId: proposalId as Id<"proposals">,
          description,
          pricingBasis: "per_unit",
          unitPrice: addOn.price,
          quantity: count,
          unit: addOn.per,
          sortOrder: nextSortOrder(),
          menuId,
        });
      });

    const byGuests = options.countUnit === "guests";
    const chargeByCount = () =>
      run(`steps:${menuId}`, async () => {
        const count = byGuests
          ? guestCount
          : await askCount(menu.name, options.countUnit);
        if (count == null) return;
        const step = priceStepFor(options, count);
        if (!step) return;
        const description = `${menu.name} (up to ${step.upTo} ${options.countUnit})`;
        if (stepLine)
          await revise(stepLine, { description, unitPrice: step.price });
        else
          await addLine({
            proposalId: proposalId as Id<"proposals">,
            description,
            pricingBasis: "package",
            unitPrice: step.price,
            sortOrder: nextSortOrder(),
            menuId,
          });
      });
    const guestStep = byGuests ? priceStepFor(options, guestCount) : null;
    const largest = options.steps[options.steps.length - 1];

    return (
      <div key={menuId} className="mt-3">
        <p className="text-base font-semibold text-ink">
          {menu.name}
          {range ? (
            <span className="font-normal text-ink-2"> · {range}</span>
          ) : null}
        </p>
        {range && options.priceTo != null && perGuestLine ? (
          <p className="text-sm text-ink-2">
            Set the price in the range on the line under Pricing.
          </p>
        ) : null}
        {options.choices.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {choices.map((choice) => {
              const current =
                perGuestLine != null &&
                Number(perGuestLine.unitPrice) === choice.pricePerPerson &&
                perGuestLine.description.endsWith(
                  choice.label ? `— ${choice.label}` : "(per guest)",
                );
              return (
                <button
                  key={choice.label || "standard"}
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={busy || current}
                  onClick={() =>
                    pickChoice(choice.label, choice.pricePerPerson)
                  }
                >
                  {choice.label || "Standard"}:{" "}
                  {menuMoney(choice.pricePerPerson)} per guest
                  {current ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        ) : null}
        {options.addOns.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {options.addOns.map((addOn) => {
              const added = addOnLine(addOn) != null;
              return (
                <button
                  key={addOn.label}
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={busy || added}
                  onClick={() => addAddOn(addOn)}
                >
                  {added ? `${addOnText(addOn)} ✓` : `Add ${addOnText(addOn)}`}
                </button>
              );
            })}
          </div>
        ) : null}
        {options.steps.length > 0 ? (
          byGuests && guestCount > 0 && !guestStep ? (
            <p className="mt-1 text-sm text-warn">
              {guestCount} guests is more than the price table ({largest.upTo}{" "}
              guests). Price it by hand under Pricing.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={
                  busy ||
                  (byGuests &&
                    (!guestStep ||
                      Number(stepLine?.unitPrice) === guestStep.price))
                }
                onClick={chargeByCount}
              >
                {guestStep
                  ? `Charge ${menuMoney(guestStep.price)} for up to ${guestStep.upTo} guests`
                  : byGuests
                    ? "Set the guest count to price by count"
                    : `Charge by number of ${options.countUnit}`}
                {stepLine &&
                guestStep &&
                Number(stepLine.unitPrice) === guestStep.price
                  ? " ✓"
                  : ""}
              </button>
            </div>
          )
        ) : null}
      </div>
    );
  };

  return (
    <div className="mt-3">
      <p className="eyebrow">Price options</p>
      {priced.map(({ menu, options }) => menuSection(menu, options))}
      {host}
    </div>
  );
}
