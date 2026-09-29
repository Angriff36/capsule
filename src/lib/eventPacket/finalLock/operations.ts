import {
  answered,
  equipmentSources,
  NONE,
  source,
  unresolved,
  type Draft,
} from "./answer";
import { externalChannelName } from "./channelName";
import { QUESTIONS, type Question } from "./policy";
import { dayTimes } from "./timelineSetup";
import type { FinalLockInput } from "./types";

/** Vehicles and equipment, and the event chat. */
export function operationsAnswers(
  input: FinalLockInput,
): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  const vehicles = input.vehicles;
  const rig = (v: (typeof vehicles)[number]) =>
    [v.vehicleName ?? "Truck", v.trailerName].filter(Boolean).join(" + ");
  const vehicleSources = [
    ...vehicles.flatMap((v) => [
      ...source("eventVehicleAssignments", v),
      ...v.busyWith.flatMap((b) => source("eventVehicleAssignments", b)),
    ]),
    ...input.equipment.flatMap(equipmentSources),
  ];
  // With more than one rig, each must say what it carries.
  const split = vehicles.length > 1;
  const problems = [
    ...(vehicles.length ? [] : ["No truck is assigned to this event."]),
    ...vehicles
      .filter((v) => v.outOfService)
      .map((v) => `${v.vehicleName ?? "A truck"} is out of service.`),
    ...vehicles.flatMap((v) =>
      v.busyWith.map(
        (b) => `${rig(v)} is also booked for ${b.eventTitle} at the same time.`,
      ),
    ),
    ...vehicles
      .filter((v) => !v.driverId)
      .map((v) => `${v.vehicleName ?? "A truck"} has no driver.`),
    ...(split
      ? vehicles
          .filter((v) => !v.notes?.trim())
          .map((v) => `${rig(v)} does not say what it carries.`)
      : []),
    ...input.equipment
      .filter((e) => e.shortBy > 0)
      .map((e) => `${e.name} is short by ${e.shortBy}.`),
    ...input.equipment
      .filter((e) => e.outOfService && e.status === "reserved")
      .map((e) => `${e.name} is marked out of service.`),
  ];
  out["vehicles.assigned"] = problems.length
    ? unresolved(
        problems,
        vehicles.length
          ? "Fix the truck and equipment assignments on the event."
          : "Assign a truck on the event.",
        "vehicles.assigned.truck-driver-equipment",
        vehicleSources,
      )
    : answered(
        {
          type: "list",
          items: vehicles.map((v) =>
            [
              rig(v),
              split ? `carries ${v.notes!.trim()}` : null,
              v.preloaded ? "already loaded" : null,
            ]
              .filter(Boolean)
              .join(" - "),
          ),
        },
        `${vehicles.length} truck${vehicles.length === 1 ? "" : "s"} with drivers, free for this event${split ? ", each with its own load" : `; everything loads on ${rig(vehicles[0]!)}`}; ${input.equipment.length} equipment reservation${input.equipment.length === 1 ? "" : "s"} covered.`,
        "vehicles.assigned.truck-driver-equipment",
        vehicleSources,
      );

  const chat = input.channel;
  const outside = input.event.externalChannel;
  const expected = externalChannelName(
    input.event.eventNumber,
    input.event.title,
  );
  const chatSources = [
    ...(chat.lastMessageId
      ? [{ table: "staffMessages", id: chat.lastMessageId, version: null }]
      : []),
    // Pinned by value: the channel name follows the number and the title.
    ...source("events", input.event, "externalChannel"),
    ...source("events", input.event, "eventNumber"),
    ...source("events", input.event, "title"),
  ];
  const chatWords = chat.messageCount
    ? `The event chat has ${chat.messageCount} message${chat.messageCount === 1 ? "" : "s"} and ${chat.attachmentCount} file${chat.attachmentCount === 1 ? "" : "s"}.`
    : "The event chat is ready; no messages yet.";
  // Every event has its own chat; an empty one is not a problem to fix. An
  // outside channel is optional, but when there is one its name must match.
  out["communication.channel"] =
    outside && outside.name !== expected
      ? unresolved(
          [
            expected
              ? `The outside chat channel is named "${outside.name}"; it should be "${expected}".`
              : `The event has an outside chat channel "${outside.name}" but no event number to name it by.`,
          ],
          expected
            ? `Rename the outside channel to "${expected}" and record the new name on the event.`
            : "Give the event its number, then rename the outside channel.",
          "communication.channel.one-event-chat",
          chatSources,
        )
      : answered(
          {
            type: "record",
            fields: {
              messages: chat.messageCount,
              attachments: chat.attachmentCount,
              outsideChannel: outside?.name ?? null,
              outsideChannelName: expected,
            },
          },
          outside
            ? `${chatWords} Mirrored to the outside channel "${outside.name}".`
            : expected
              ? `${chatWords} An outside channel, if the team makes one, is named "${expected}".`
              : chatWords,
          "communication.channel.one-event-chat",
          chatSources,
        );
  return out;
}

const SIGNOFFS = [
  "check.signature.warehouse-ops",
  "check.signature.event-lead",
];

/** Final readiness from actual work (spec §14.2), after office answers. */
export function readinessAnswer(
  input: FinalLockInput,
  officeOpen: string[],
  /** The printed Final Lock answers or policy no longer match. */
  answersStale = false,
): { draft: Draft; officeOpen: boolean } {
  const active = input.assignments.filter(
    (a) => a.status !== "unassigned" && a.status !== "no_show",
  );
  const signed = SIGNOFFS.map((key) =>
    input.packet.signoffs.find((s) => s.key === key),
  );
  const checks = {
    salesLock: input.event.salesLockedAt != null,
    opsFinal: officeOpen.length === 0,
    packetCurrent:
      input.packet.latestRevisionId != null &&
      !input.packet.latestRevisionStale &&
      !answersStale,
    staffingCommunicated:
      active.length > 0 &&
      active.every(
        (a) =>
          a.confirmedAt != null ||
          ["confirmed", "checked_in", "checked_out"].includes(a.status),
      ),
    packComplete:
      input.packLists.length > 0 &&
      input.packLists.every(
        (p) =>
          ["packed", "loaded", "dispatched"].includes(p.status) &&
          p.missingCount === 0,
      ),
    twoPersonSignature:
      signed.every(Boolean) && signed[0]!.actor !== signed[1]!.actor,
  };
  const words: Record<keyof typeof checks, string> = {
    salesLock: "Sales has not locked the event.",
    opsFinal: `Office questions still open: ${officeOpen.join(", ")}.`,
    packetCurrent: input.packet.latestRevisionId
      ? "The printed event packet is out of date."
      : "No event packet has been prepared.",
    staffingCommunicated: active.length
      ? "Not every staff member has confirmed their shift."
      : "No staff are assigned.",
    packComplete: input.packLists.length
      ? "The pack list is not fully packed."
      : "No pack list for this event.",
    twoPersonSignature:
      signed.every(Boolean) && signed[0]!.actor === signed[1]!.actor
        ? "The before-takeoff check was signed twice by the same person; it needs two people."
        : "The before-takeoff check is not signed by warehouse and the event lead.",
  };
  const open = (Object.keys(checks) as (keyof typeof checks)[]).filter(
    (k) => !checks[k],
  );
  const sources = [
    ...source("events", input.event, "salesLockedAt"),
    ...input.packLists.flatMap((p) => source("packLists", p)),
    ...active.flatMap((a) => source("eventAssignments", a)),
    ...signed.flatMap((s) => (s?.source ? [s.source] : [])),
    ...(input.packet.latestRevisionId
      ? [
          {
            table: "eventPacketRevisions",
            id: input.packet.latestRevisionId,
            version: null,
          },
        ]
      : []),
  ];
  const draft = open.length
    ? unresolved(
        open.map((k) => words[k]),
        `Finish first: ${words[open[0]!]}`,
        "readiness.dispatch.from-actual-work",
        sources,
      )
    : answered(
        { type: "record", fields: { ...checks, readyToDispatch: true } },
        "Sales locked, office answers done, packet current, staff confirmed, packed, and two people signed before takeoff.",
        "readiness.dispatch.from-actual-work",
        sources,
      );
  return {
    draft,
    // An out-of-date packet is the Stale outcome, not an office question.
    officeOpen: open.some(
      (k) =>
        !PHYSICAL_CHECKS.includes(k) &&
        !(k === "packetCurrent" && input.packet.latestRevisionId),
    ),
  };
}

/** Readiness checks only people on the floor can finish. */
const PHYSICAL_CHECKS: string[] = ["packComplete", "twoPersonSignature"];

/**
 * The readiness line a packet prints. It names only what the office settles
 * before the print (sales lock, office answers), so recording the print does
 * not change it. The packet's own state, staff replies, packing and the
 * two-person check change after the print and are tracked live.
 */
export function readinessPrintAnswer(
  input: FinalLockInput,
  officeOpen: string[],
): Draft {
  const checks = {
    salesLock: input.event.salesLockedAt != null,
    opsFinal: officeOpen.length === 0,
  };
  const words: Record<keyof typeof checks, string> = {
    salesLock: "Sales has not locked the event.",
    opsFinal: `Office questions still open: ${officeOpen.join(", ")}.`,
  };
  const open = (Object.keys(checks) as (keyof typeof checks)[]).filter(
    (k) => !checks[k],
  );
  const sources = source("events", input.event, "salesLockedAt");
  return open.length
    ? unresolved(
        open.map((k) => words[k]),
        `Finish first: ${words[open[0]!]}`,
        "readiness.dispatch.printed-office-side",
        sources,
      )
    : answered(
        { type: "record", fields: { ...checks } },
        "Sales locked and office answers done. Staff replies, packing and the two-person check before takeoff are tracked live in Capsule.",
        "readiness.dispatch.printed-office-side",
        sources,
      );
}

/** When each physical form is due, from the day plan. */
const DUE_AT: Record<string, string> = {
  "field.leaving-shop": "shop_departure",
  "field.takeoff-readiness": "shop_departure",
  "field.packing": "shop_departure",
  "field.bins": "shop_departure",
  "field.arrival": "onsite_arrival",
  "field.buffet-drawing": "service",
  "field.muda": "venue_departure",
  "field.after-event": "venue_departure",
  "field.leaving-event": "venue_departure",
  "field.return": "staff_off",
};

/** Physical work is never answered by the office: a person confirms it. */
export function fieldAnswers(
  input: FinalLockInput,
  policy: readonly Question[] = QUESTIONS,
): Record<string, Draft> {
  const { times } = dayTimes(input);
  const out: Record<string, Draft> = {};
  for (const question of policy.filter((item) => item.form)) {
    const form = question.form!;
    const done = input.confirmations[form] ?? null;
    const dueAt = times[DUE_AT[form] ?? ""] ?? null;
    out[question.key] = {
      result: "field_confirmation",
      value: NONE,
      explanation: done
        ? `${question.label} was done on the day by a named person.`
        : `${question.label} is done on the day by a named person; it cannot be answered from the office.`,
      rule: "field.physical-work-needs-a-person",
      sources: done?.source ? [done.source] : [],
      missing: [],
      action: done
        ? null
        : `Complete the ${question.label.toLowerCase()} form on the day.`,
      fieldWork: {
        form,
        dueAt,
        confirmedAt: done?.at ?? null,
        confirmedBy: done?.actor ?? null,
      },
    };
  }
  return out;
}
