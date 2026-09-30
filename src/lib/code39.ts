/**
 * Code 39 barcode: the plain bar label every USB scanner and phone camera
 * reads. The bars carry capitals, digits, space and - . $ / + % only; a
 * label starts and ends with "*". Pure.
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

/** The standard two-character pair for a keyboard character (Code 39 full ASCII). */
function pairFor(code: number): string | null {
  const from = (lead: string, first: string, offset: number) =>
    lead + String.fromCharCode(first.charCodeAt(0) + offset);
  if (code >= 33 && code <= 44) return from("/", "A", code - 33);
  if (code === 47) return "/O";
  if (code === 58) return "/Z";
  if (code >= 59 && code <= 63) return from("%", "F", code - 59);
  if (code === 64) return "%V";
  if (code >= 91 && code <= 95) return from("%", "K", code - 91);
  if (code === 96) return "%W";
  if (code >= 123 && code <= 126) return from("%", "P", code - 123);
  return null;
}

/**
 * What the bars carry for `raw`. Capitals, digits, space, "-" and "." go on
 * the label as they are and small letters become capitals. Every other
 * keyboard character becomes its standard two-character pair ("_" is "%O"),
 * so two different codes never print the same bars. Null when the code is
 * empty or has a character a bar label cannot carry.
 */
export function code39Text(raw: string): string | null {
  let text = "";
  for (const character of raw.trim().toUpperCase()) {
    if (/^[A-Z0-9 .-]$/.test(character)) {
      text += character;
      continue;
    }
    const pair =
      character.length === 1 ? pairFor(character.charCodeAt(0)) : null;
    if (pair == null) return null;
    text += pair;
  }
  return text === "" ? null : text;
}

export type Code39Bar = { x: number; width: number };

/**
 * The black bars of one label, in narrow-stripe units, with the full width.
 * A wide stripe is three narrow ones; one narrow gap separates characters.
 */
export function code39Bars(carried: string): {
  bars: Code39Bar[];
  width: number;
} {
  // `carried` is what code39Text returned.
  const text = `*${carried}*`;
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
