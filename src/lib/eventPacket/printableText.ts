/** Explicit ASCII fallbacks prevent built-in PDF font missing glyphs. Unknown characters stay visible as codepoints. */
export function printableText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/☐/g, "[ ]")
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(
      /[^\x20-\x7e\n]/gu,
      (c) => `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`,
    );
}
