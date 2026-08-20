/**
 * First-class EventDish menu-line fields (sell, pans) plus leftover SELL: read.
 * New writes use a structured packet — not SELL: in notes.
 */

import { parseUnitSellPrice } from "./eventMenuSellPrice";

const PACKET_LINE = /^@capsule\.menu\s+(\{.*\})\s*$/;

export type EventMenuLineFields = {
  unitSellPrice: number | null;
  containerCount: number | null;
  notes: string;
};

export type EventMenuLineSavePlan = {
  unitSellPrice: number | null;
  containerCount: number | null;
  quantityServings: number;
  specialInstructions: string;
  servingsChanged: boolean;
  fieldsChanged: boolean;
};

function asNonnegativeNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : null;
}

/** Leftover notes like "1 Half pan" / "3 Foil wrap" carry the pans count. */
function parseLeadingContainerCount(notes: string): number | null {
  const match = String(notes).match(/^(\d+)(?:\s+|$)/);
  return match ? asNonnegativeNumber(match[1]) : null;
}

function stripLegacySell(notes: string): string {
  return notes.replace(/(?:^|\n)SELL:-?\d+(?:\.\d+)?\n?/g, "").trim();
}

function stripPacketLines(notes: string): string {
  return notes
    .split("\n")
    .filter((line) => !PACKET_LINE.test(line.trim()))
    .join("\n")
    .trim();
}

export function parseEventMenuLineFields(
  specialInstructions?: string | null,
): EventMenuLineFields {
  const raw = String(specialInstructions ?? "");
  let unitSellPrice: number | null = null;
  let containerCount: number | null = null;
  for (const line of raw.split("\n")) {
    const match = line.trim().match(PACKET_LINE);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1] ?? "{}") as {
        unitSellPrice?: unknown;
        containerCount?: unknown;
      };
      if (unitSellPrice == null) {
        unitSellPrice = asNonnegativeNumber(parsed.unitSellPrice);
      }
      if (containerCount == null) {
        containerCount = asNonnegativeNumber(parsed.containerCount);
      }
    } catch {
      // Ignore a broken packet and keep scanning leftover SELL:.
    }
  }
  if (unitSellPrice == null) {
    unitSellPrice = parseUnitSellPrice(raw);
  }
  const notes = stripLegacySell(stripPacketLines(raw));
  if (containerCount == null) {
    containerCount = parseLeadingContainerCount(notes);
  }
  return {
    unitSellPrice,
    containerCount,
    notes,
  };
}

export function encodeEventMenuLineFields(fields: {
  unitSellPrice?: number | null;
  containerCount?: number | null;
  notes?: string | null;
}): string {
  const packet: { unitSellPrice?: number; containerCount?: number } = {};
  const unitSellPrice = asNonnegativeNumber(fields.unitSellPrice);
  const containerCount = asNonnegativeNumber(fields.containerCount);
  if (unitSellPrice != null) packet.unitSellPrice = unitSellPrice;
  if (containerCount != null) packet.containerCount = containerCount;
  const notes = stripLegacySell(stripPacketLines(String(fields.notes ?? "")));
  const encoded =
    Object.keys(packet).length > 0
      ? `@capsule.menu ${JSON.stringify(packet)}`
      : "";
  return [encoded, notes].filter((part) => part.length > 0).join("\n");
}

/** Prefer a first-class number. Legacy SELL: only paints already-entered rows. */
export function resolveUnitSellPrice(line: {
  unitSellPrice?: number | null;
  specialInstructions?: string | null;
}): number | null {
  const firstClass = asNonnegativeNumber(line.unitSellPrice);
  if (firstClass != null) return firstClass;
  return parseEventMenuLineFields(line.specialInstructions).unitSellPrice;
}

export function resolveContainerCount(line: {
  containerCount?: number | null;
  specialInstructions?: string | null;
}): number | null {
  const firstClass = asNonnegativeNumber(line.containerCount);
  if (firstClass != null) return firstClass;
  return parseEventMenuLineFields(line.specialInstructions).containerCount;
}

export function eventMenuLineServings(line: {
  quantityServings?: number | null;
  expectedHeadcount?: number | null;
}): number {
  const servings = Number(line.quantityServings);
  if (Number.isFinite(servings) && servings >= 0) return servings;
  const guests = Number(line.expectedHeadcount);
  return Number.isFinite(guests) && guests > 0 ? guests : 0;
}

export function planEventMenuLineSave(input: {
  currentInstructions?: string | null;
  currentServings: number;
  nextSellRaw: string;
  nextServingsRaw: string;
  nextContainerRaw: string;
  nextNotes?: string | null;
}): EventMenuLineSavePlan {
  const current = parseEventMenuLineFields(input.currentInstructions);
  const unitSellPrice =
    input.nextSellRaw.trim() === ""
      ? null
      : asNonnegativeNumber(input.nextSellRaw);
  const typedCount =
    input.nextContainerRaw.trim() === ""
      ? null
      : asNonnegativeNumber(input.nextContainerRaw);
  const containerCount = typedCount ?? current.containerCount;
  const quantityServings = eventMenuLineServings({
    quantityServings: Number(input.nextServingsRaw),
    expectedHeadcount: input.currentServings,
  });
  const specialInstructions = encodeEventMenuLineFields({
    unitSellPrice,
    containerCount,
    notes: input.nextNotes ?? current.notes,
  });
  return {
    unitSellPrice,
    containerCount,
    quantityServings,
    specialInstructions,
    servingsChanged: quantityServings !== Number(input.currentServings),
    fieldsChanged:
      specialInstructions !== String(input.currentInstructions ?? ""),
  };
}
