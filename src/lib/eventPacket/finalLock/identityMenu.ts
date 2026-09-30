import {
  answered,
  customerSources,
  dishSources as dishRecords,
  eventStyleName,
  source,
  styleSources as bookedStyleSources,
  unresolved,
  type Draft,
} from "./answer";
import { isDropOff } from "./policy";
import type { FinalLockInput } from "./types";

const ev = (input: FinalLockInput, field: string) =>
  source("events", input.event, field);

/** Event identity (spec §14.2): Sales owns every blank or clash. */
export function identityAnswers(input: FinalLockInput): Record<string, Draft> {
  const { event, client, venue } = input;
  const out: Record<string, Draft> = {};

  // The event keeps the names it was booked with; a later catalog rename
  // does not change them and is not a clash.
  const styleName = eventStyleName(input);
  const styleSources = [
    ...ev(input, "serviceStyleId"),
    ...bookedStyleSources(input),
  ];
  out["identity.service_style"] = styleName
    ? answered(
        { type: "choice", choice: styleName },
        `Service style is ${styleName}.`,
        "identity.service_style.from-event",
        styleSources,
      )
    : unresolved(
        ["No service style is set on the event."],
        "Choose the service style on the event.",
        "identity.service_style.required",
        styleSources,
      );

  const guests = event.expectedHeadcount;
  out["identity.guest_count"] =
    guests != null && guests > 0
      ? answered(
          { type: "count", count: guests },
          `${guests} guests.`,
          "identity.guest_count.from-event",
          ev(input, "expectedHeadcount"),
        )
      : unresolved(
          ["No guest count is set on the event."],
          "Enter the guest count on the event.",
          "identity.guest_count.required",
          ev(input, "expectedHeadcount"),
        );

  const venueName = event.venueName?.trim() || venue?.name || "";
  const venueSources = [...ev(input, "venueName"), ...source("venues", venue)];
  if (!venueName)
    out["identity.venue"] = unresolved(
      ["No venue is set on the event."],
      "Choose the venue on the event.",
      "identity.venue.required",
      venueSources,
    );
  else if (
    event.venueCapacity != null &&
    guests != null &&
    guests > event.venueCapacity
  )
    out["identity.venue"] = unresolved(
      [
        `${venueName} holds ${event.venueCapacity} but the event has ${guests} guests.`,
      ],
      "Change the guest count or the venue.",
      "identity.venue.fits-guests",
      [...venueSources, ...ev(input, "expectedHeadcount")],
    );
  else
    out["identity.venue"] = answered(
      {
        type: "record",
        fields: { name: venueName, address: event.venueAddress ?? null },
      },
      event.venueAddress
        ? `${venueName}, ${event.venueAddress}.`
        : `${venueName}.`,
      "identity.venue.from-event",
      venueSources,
    );

  const customer = event.clientName?.trim() || client?.name.trim() || "";
  const clientSources = [...ev(input, "clientId"), ...customerSources(input)];
  out["identity.customer"] = customer
    ? answered(
        { type: "choice", choice: customer },
        `Customer is ${customer}.`,
        "identity.customer.from-client",
        clientSources,
      )
    : unresolved(
        ["No customer is linked to the event."],
        "Link the customer on the event.",
        "identity.customer.required",
        clientSources,
      );

  const contactMissing = [
    ...(event.contactName?.trim() ? [] : ["No day-of contact name."]),
    ...(event.contactPhone?.trim() || event.contactEmail?.trim()
      ? []
      : ["No phone or email for the day-of contact."]),
  ];
  out["identity.contact"] = contactMissing.length
    ? unresolved(
        contactMissing,
        "Fill in the day-of contact on the event.",
        "identity.contact.name-and-reach",
        ev(input, "primaryContactName"),
      )
    : answered(
        {
          type: "record",
          fields: {
            name: event.contactName,
            phone: event.contactPhone,
            email: event.contactEmail,
          },
        },
        `Day-of contact is ${event.contactName}.`,
        "identity.contact.from-event",
        ev(input, "primaryContactName"),
      );

  out["identity.event_number"] = event.eventNumber?.trim()
    ? answered(
        { type: "text", text: event.eventNumber.trim() },
        `Event number ${event.eventNumber.trim()}.`,
        "identity.event_number.from-event",
        ev(input, "eventNumber"),
      )
    : unresolved(
        ["No event number is set."],
        "Set the event number on the event.",
        "identity.event_number.required",
        ev(input, "eventNumber"),
      );

  out["identity.owner"] =
    event.assignedToId || event.ownerName?.trim()
      ? answered(
          { type: "text", text: event.ownerName?.trim() || "Assigned" },
          `${event.ownerName?.trim() || "A staff member"} owns this event.`,
          "identity.owner.from-event",
          ev(input, "assignedToId"),
        )
      : unresolved(
          ["Nobody owns this event."],
          "Assign an owner on the event.",
          "identity.owner.required",
          ev(input, "assignedToId"),
        );

  // Zero is a real quoted price (a comped or in-house event).
  const price = event.quotedPrice;
  const priced = price != null && Number.isFinite(price) && price >= 0;
  const billingMissing = [
    ...(customer ? [] : ["No customer to send the bill to."]),
    ...(priced ? [] : ["No quoted price on the event."]),
  ];
  out["identity.billing"] = billingMissing.length
    ? unresolved(
        billingMissing,
        customer
          ? "Enter the quoted price on the event."
          : "Link the customer on the event.",
        "identity.billing.customer-and-price",
        [...clientSources, ...ev(input, "quotedPrice")],
      )
    : answered(
        {
          type: "record",
          fields: { billTo: customer, quotedPrice: price },
        },
        `${customer} pays the quoted ${price}.`,
        "identity.billing.from-event-and-client",
        [...clientSources, ...ev(input, "quotedPrice")],
      );
  return out;
}

const EMPTY_SHELL = /^[\s*.·…_-]*$|\*{3}|\.{3}|…/;
const OPEN_NOTE = /\b(tbd|tba|to confirm|confirm with)\b|\?/i;
const PASSED_OR_STATION = /\b(passed|station|carv)/i;

/** Menu quality (spec §14.2): order, servings, shells, notes, service fit. */
export function menuAnswers(input: FinalLockInput): Record<string, Draft> {
  const dishes = input.dishes;
  const out: Record<string, Draft> = {};
  const dishSources = dishes.flatMap((d) => dishRecords(d));
  if (!dishes.length) {
    const none = unresolved(
      ["No dishes are on the menu."],
      "Add the dishes to the event menu.",
      "menu.required",
      [],
    );
    for (const key of [
      "menu.order",
      "menu.servings",
      "menu.no_empty_shell",
      "menu.production_notes",
      "menu.service_fit",
    ])
      out[key] = none;
    return out;
  }

  const unplaced = dishes.filter((d) => d.sortOrder == null);
  const shared = dishes.filter((d) =>
    dishes.some(
      (o) => o !== d && o.sortOrder != null && o.sortOrder === d.sortOrder,
    ),
  );
  out["menu.order"] =
    unplaced.length || shared.length
      ? unresolved(
          [
            ...unplaced.map((d) => `${d.name} has no place in the menu order.`),
            ...(shared.length
              ? [
                  `${shared.map((d) => d.name).join(", ")} share a place in the menu order.`,
                ]
              : []),
          ],
          "Put the dishes in service order on the event menu.",
          "menu.order.every-dish-placed",
          dishSources,
        )
      : answered(
          {
            type: "list",
            items: dishes
              .slice()
              .sort((a, b) => a.sortOrder! - b.sortOrder!)
              .map((d) => d.name),
          },
          "Every dish has its own place in the menu order.",
          "menu.order.every-dish-placed",
          dishSources,
        );

  const guests = input.event.expectedHeadcount;
  const short = dishes.filter(
    (d) =>
      d.followsEventHeadcount !== false &&
      (d.quantityServings == null ||
        (guests != null && d.quantityServings < guests)),
  );
  out["menu.servings"] =
    guests == null || guests <= 0
      ? unresolved(
          ["No guest count to check the servings against."],
          "Enter the guest count on the event.",
          "menu.servings.cover-guests",
          [
            ...dishSources,
            ...source("events", input.event, "expectedHeadcount"),
          ],
        )
      : short.length
        ? unresolved(
            short.map((d) =>
              d.quantityServings == null
                ? `${d.name} has no servings.`
                : `${d.name}: ${d.quantityServings} servings for ${guests} guests.`,
            ),
            "Change the servings on the menu, or hold the dish at its own count.",
            "menu.servings.cover-guests",
            [
              ...dishSources,
              ...source("events", input.event, "expectedHeadcount"),
            ],
          )
        : answered(
            { type: "count", count: guests },
            `Every dish covers ${guests} guests or is held at its own count on purpose.`,
            "menu.servings.cover-guests",
            [
              ...dishSources,
              ...source("events", input.event, "expectedHeadcount"),
            ],
          );

  const shells = dishes.filter((d) => EMPTY_SHELL.test(d.name));
  out["menu.no_empty_shell"] = shells.length
    ? unresolved(
        shells.map((d) => `Menu line "${d.name}" is a blank placeholder.`),
        "Replace or remove the placeholder menu lines.",
        "menu.no_empty_shell.named-dishes",
        shells.flatMap((d) => dishRecords(d)),
      )
    : answered(
        { type: "yes_no", yes: true },
        "Every menu line names a real dish.",
        "menu.no_empty_shell.named-dishes",
        dishSources,
      );

  const open = dishes.filter((d) => d.notes && OPEN_NOTE.test(d.notes));
  out["menu.production_notes"] = open.length
    ? unresolved(
        open.map((d) => `${d.name} note still asks: "${d.notes!.trim()}".`),
        "Answer the open question in the dish note.",
        "menu.production_notes.no-open-question",
        open.flatMap((d) => dishRecords(d, "specialInstructions")),
      )
    : answered(
        {
          type: "list",
          items: dishes.filter((d) => d.notes?.trim()).map((d) => d.name),
        },
        "No dish note is waiting on an answer.",
        "menu.production_notes.no-open-question",
        dishSources,
      );

  const style = eventStyleName(input);
  const misfit = dishes.flatMap((d) => {
    if (isDropOff(style) && PASSED_OR_STATION.test(d.course ?? ""))
      return [
        `${d.name} is ${d.course}, which needs staff, but this is a drop-off.`,
      ];
    if (
      style &&
      d.serviceStyle?.trim() &&
      d.serviceStyle.trim().toLowerCase() !== style.toLowerCase()
    )
      return [
        `${d.name} is set up for ${d.serviceStyle}, but the event is ${style}.`,
      ];
    return [];
  });
  out["menu.service_fit"] = !style
    ? unresolved(
        ["No service style to check the dishes against."],
        "Choose the service style on the event.",
        "menu.service_fit.matches-style",
        dishSources,
      )
    : misfit.length
      ? unresolved(
          misfit,
          "Change the dish service or the event service style.",
          "menu.service_fit.matches-style",
          [...dishSources, ...bookedStyleSources(input)],
        )
      : answered(
          { type: "yes_no", yes: true },
          `Every dish fits ${style}.`,
          "menu.service_fit.matches-style",
          [...dishSources, ...bookedStyleSources(input)],
        );
  return out;
}
