import {
  answered,
  notApplicable,
  proposalSources,
  said,
  source,
  unresolved,
  type Draft,
} from "./answer";
import { isDropOff } from "./policy";
import type { FinalLockInput } from "./types";

// "No full bussing" / "full bussing not included" deny full bussing only;
// "no bussing" denies all of it. Negation is read before the word "full".
const notFull = (s: string) =>
  /\b(no|not|without)\b[^.;]*\bfull\b|\bfull\b[^.;]*\bnot included\b/i.test(s);
const isFull = (s: string) => /\bfull\b/i.test(s) && !notFull(s);
const isNone = (s: string) =>
  !/\bfull\b/i.test(s) &&
  /\bno bussing\b|\bbussing (is )?not included\b|\bwithout bussing\b/i.test(s);

/**
 * Bussing: bus after dinner by default; full bussing only when the event or
 * the accepted contract says so, and the two must agree.
 */
export function bussingAnswer(input: FinalLockInput): Draft {
  const { event } = input;
  const ev = (field: string) => source("events", event, field);
  const dropOff = isDropOff(input.serviceStyle?.name ?? null);
  const bussing = event.text.bussing?.trim() ?? "";
  const bussLines = (input.proposal?.lines ?? []).filter((l) =>
    /buss|clear(ing)? (the )?tables/i.test(l.text),
  );
  const contractFull = bussLines.find((l) => isFull(l.text));
  const contractNone = bussLines.find((l) => isNone(l.text));
  const contractNotFull = bussLines.find((l) => notFull(l.text));
  const bussSources = [
    ...ev("bussing"),
    ...source("proposals", input.proposal),
    ...bussLines.flatMap((l) => proposalSources(input.proposal, l)),
  ];
  // Two accepted contract lines that disagree cannot answer the question.
  const against = contractNone ?? contractNotFull;
  if (contractFull && against)
    return unresolved(
      [
        `Accepted contract line "${contractFull.text}" sells full bussing, but line "${against.text}" says ${contractNone ? "no bussing" : "no full bussing"}.`,
      ],
      "Fix the accepted contract so its bussing lines agree.",
      "bussing.plan.contract-lines-agree",
      bussSources,
    );
  const eventFull = isFull(bussing);
  const eventNo = said(bussing).kind === "no" || isNone(bussing);
  const bussClash = dropOff
    ? null
    : contractFull && bussing && !eventFull
      ? `The event says bussing "${bussing}", but accepted contract line "${contractFull.text}" sells full bussing.`
      : contractNone && bussing && !eventNo
        ? `The event says bussing "${bussing}", but accepted contract line "${contractNone.text}" says no bussing.`
        : eventFull && input.proposal && !contractFull
          ? "The event says full bussing, but the accepted contract does not sell it."
          : null;
  if (bussClash)
    return unresolved(
      [bussClash],
      "Make the bussing answer on the event match the accepted contract.",
      "bussing.plan.contract-agrees",
      bussSources,
    );
  if (!dropOff && !bussing && (contractFull || contractNone || contractNotFull))
    return answered(
      {
        type: "record",
        fields: contractFull
          ? { afterDinner: true, full: true }
          : contractNone
            ? { afterDinner: false, full: false }
            : { afterDinner: true, full: false },
      },
      contractFull
        ? "Full bussing, including glassware: the accepted contract sells it."
        : contractNone
          ? "No bussing: the accepted contract says so."
          : "Bus after dinner; the accepted contract says no full bussing.",
      "bussing.plan.contract-says",
      bussSources,
    );
  if (dropOff)
    return bussing && !eventNo
      ? unresolved(
          [
            `Bussing says "${bussing}" but a drop-off has no staff to clear tables.`,
          ],
          "Clear the bussing answer or change the service style.",
          "bussing.plan.staff-needed",
          [...ev("bussing"), ...source("serviceStyles", input.serviceStyle)],
        )
      : notApplicable(
          "Drop-off: no staff stay to clear tables.",
          "bussing.plan.drop-off",
          source("serviceStyles", input.serviceStyle),
        );
  if (eventFull)
    return answered(
      { type: "record", fields: { afterDinner: true, full: true } },
      "Full bussing, including glassware, as the event says.",
      "bussing.plan.event-says",
      bussSources,
    );
  if (eventNo)
    return answered(
      { type: "record", fields: { afterDinner: false, full: false } },
      "No bussing: the event says so.",
      "bussing.plan.event-says",
      bussSources,
    );
  return answered(
    { type: "record", fields: { afterDinner: true, full: false } },
    bussing
      ? `Bus after dinner (${bussing}); no full bussing.`
      : input.proposal
        ? "Bus after dinner; the accepted contract does not sell full bussing."
        : "Bus after dinner; no full bussing unless the contract says so.",
    bussing ? "bussing.plan.event-says" : "bussing.plan.mangia-default",
    bussSources,
  );
}
