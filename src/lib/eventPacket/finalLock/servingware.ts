import { answered, said, source, unresolved, type Draft } from "./answer";
import type { AnswerSource, FinalLockInput } from "./types";

type Piece =
  "Plasticware" | "Rented pieces" | "Mangia pieces" | "Client-provided pieces";

const PIECES: [Piece, RegExp][] = [
  ["Plasticware", /plastic|disposable/i],
  ["Rented pieces", /rent/i],
  ["Mangia pieces", /mangia|\bour\b|house china/i],
  ["Client-provided pieces", /client|customer|host/i],
];
/** Words that make a record line about plates, china, flatware or glasses. */
const WARE =
  /plate|china|flatware|cutlery|silverware|utensil|fork|knife|knives|spoon|glass|goblet|servingware|dinnerware|plasticware|disposable|charger/i;

const pieceIn = (text: string) =>
  PIECES.find(([, re]) => re.test(text))?.[0] ?? null;

interface Seen {
  piece: Piece;
  what: string;
  source: AnswerSource;
}

/**
 * Servingware: where plates, china and flatware come from. Joins the task
 * breakdown and day sheet with the accepted proposal, rentals, the service
 * style kit and the pack lists; a record that disagrees is an exception.
 */
export function servingwareAnswer(input: FinalLockInput): {
  draft: Draft;
  pieces: string[];
} {
  const { event } = input;
  const text = event.text;
  const ev = (field: string) => source("events", event, field);
  const yesLike = (kind: string) => kind === "yes" || kind === "party";
  const rentals = said(text.eventRentals);
  const disposables = said(text.mangiaDisposables);
  const stated = text.servingwareSource?.trim() ?? "";
  const statedPieces = PIECES.filter(([, re]) => re.test(stated)).map(
    ([name]) => name,
  );

  const seen: Seen[] = [];
  for (const line of input.proposal?.lines ?? []) {
    const piece = WARE.test(line.text) ? pieceIn(line.text) : null;
    if (piece)
      seen.push({
        piece,
        what: `Accepted proposal line "${line.text}"`,
        source: { table: line.table, id: line.id, version: line.version },
      });
  }
  for (const row of input.equipment)
    if (WARE.test(`${row.name} ${row.category ?? ""}`))
      seen.push({
        piece: row.rented
          ? "Rented pieces"
          : (pieceIn(row.name) ?? "Mangia pieces"),
        what: `${row.rented ? "Rental" : "Equipment"} "${row.name}"`,
        source: {
          table: "equipmentReservations",
          id: row.id,
          version: row.version,
        },
      });
  for (const [rows, table, what] of [
    [input.kitItems, "serviceStyleKitItems", "Service style kit item"],
    [input.packItems, "packListItems", "Pack list line"],
  ] as const)
    for (const row of rows)
      if (WARE.test(row.description))
        seen.push({
          piece: pieceIn(row.description) ?? "Mangia pieces",
          what: `${what} "${row.description}"`,
          source: { table, id: row.id, version: row.version },
        });

  const pieces = [
    ...new Set<string>([
      ...(stated
        ? statedPieces
        : [
            ...(yesLike(disposables.kind) ? ["Plasticware"] : []),
            ...(yesLike(rentals.kind) ? ["Rented pieces"] : []),
          ]),
      ...seen.map((s) => s.piece),
    ]),
  ];
  const sources = [
    ...ev("servingwareSource"),
    ...ev("eventRentals"),
    ...ev("mangiaDisposables"),
    ...seen.map((s) => s.source),
  ];
  const rule = "servingware.source.records-and-task-breakdown";
  const clash = [
    ...(stated && !statedPieces.length
      ? [
          `Servingware source "${stated}" does not say plasticware, rented, Mangia or client pieces.`,
        ]
      : []),
    ...(stated
      ? seen
          .filter((s) => !statedPieces.includes(s.piece))
          .map(
            (s) =>
              `${s.what} means ${s.piece.toLowerCase()}, but the servingware source says "${stated}".`,
          )
      : []),
    ...(pieces.includes("Rented pieces") && rentals.kind === "no"
      ? [
          seen.some((s) => s.piece === "Rented pieces")
            ? `${seen.find((s) => s.piece === "Rented pieces")!.what} means rented pieces, but the day sheet says no rentals.`
            : "Servingware says rented pieces but the day sheet says no rentals.",
        ]
      : []),
    ...(stated &&
    !statedPieces.includes("Rented pieces") &&
    yesLike(rentals.kind)
      ? ["The day sheet has rentals but the servingware source does not."]
      : []),
  ];
  const draft = clash.length
    ? unresolved(
        clash,
        "Fix the servingware source on the task breakdown, or correct the record it disagrees with.",
        rule,
        sources,
      )
    : pieces.length
      ? answered(
          { type: "list", items: pieces },
          `Plates, china and flatware: ${pieces.join(", ")}.`,
          rule,
          sources,
        )
      : unresolved(
          ["Nobody has said where the plates, china and flatware come from."],
          "Fill in the servingware source on the task breakdown.",
          rule,
          sources,
        );
  return { draft, pieces };
}
