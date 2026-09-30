/**
 * Code 39 barcode: the plain bar label every USB scanner and phone camera
 * reads. Capitals, digits, space and - . $ / + % only; a label starts and
 * ends with "*". Pure.
 *
 * Each character is nine stripes (bar, gap, bar, gap, bar, gap, bar, gap,
 * bar), three of them wide. Digits and letters are built from the standard
 * rule instead of a typed table: two of the five bars are wide (weights
 * 1, 2, 4, 7 and a parity bar) and one of the four gaps is wide (which one
 * says which group of ten the character is in).
 */

const BAR_WEIGHTS = [1, 2, 4, 7, 0];
const GROUPS = ["1234567890", "ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ-. *"];
/** Wide gap of each group: digits use the second gap, A-J the third... */
const GROUP_GAP = [1, 2, 3, 0];
/** The four all-narrow-bar characters: three of the four gaps are wide. */
const GAP_ONLY: Record<string, string> = {
  $: "1110",
  "/": "1101",
  "+": "1011",
  "%": "0111",
};

function barsFor(position: number): string {
  // position 1..10; 10 is the sum 4 + 7 with no parity bar.
  const value = position === 10 ? 11 : position;
  const picked: number[] = [];
  let rest = value;
  for (const weight of [7, 4, 2, 1]) {
    if (rest >= weight && picked.length < 2) {
      picked.push(weight);
      rest -= weight;
    }
  }
  const wide = BAR_WEIGHTS.map((weight) =>
    weight !== 0 && picked.includes(weight) ? "1" : "0",
  );
  if (picked.length === 1) wide[4] = "1";
  return wide.join("");
}

function buildPatterns(): Record<string, string> {
  const patterns: Record<string, string> = {};
  GROUPS.forEach((group, groupIndex) => {
    [...group].forEach((character, index) => {
      const bars = barsFor(index + 1);
      const gaps = [0, 1, 2, 3]
        .map((gap) => (gap === GROUP_GAP[groupIndex] ? "1" : "0"))
        .join("");
      patterns[character] = [...bars]
        .map((bar, at) => bar + (gaps[at] ?? ""))
        .join("");
    });
  });
  for (const [character, gaps] of Object.entries(GAP_ONLY))
    patterns[character] = ["0", "0", "0", "0", "0"]
      .map((bar, at) => bar + (gaps[at] ?? ""))
      .join("");
  return patterns;
}

/** Nine stripes per character, "1" = wide, bar first. */
export const CODE39_PATTERNS: Readonly<Record<string, string>> =
  buildPatterns();

/** What a label can carry: capitals, digits, space and - . $ / + %. */
export function code39Text(raw: string): string {
  return [...raw.trim().toUpperCase()]
    .map((character) =>
      character !== "*" && CODE39_PATTERNS[character] ? character : "-",
    )
    .join("");
}

export type Code39Bar = { x: number; width: number };

/**
 * The black bars of one label, in narrow-stripe units, with the full width.
 * A wide stripe is three narrow ones; one narrow gap separates characters.
 */
export function code39Bars(raw: string): { bars: Code39Bar[]; width: number } {
  const text = `*${code39Text(raw)}*`;
  const bars: Code39Bar[] = [];
  let x = 0;
  for (const character of text) {
    const pattern = CODE39_PATTERNS[character]!;
    [...pattern].forEach((stripe, index) => {
      const width = stripe === "1" ? 3 : 1;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
    x += 1;
  }
  return { bars, width: x - 1 };
}
