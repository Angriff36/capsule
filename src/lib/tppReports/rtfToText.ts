/**
 * TPP saves the BEO and the event worksheet as .rtf. This turns that file into
 * the same plain text a person gets from "select all, copy" in the PDF, so
 * `parseBeoText` reads it unchanged. It covers what those exports use:
 * paragraphs, tabs, table cells, \'hh bytes, \uN characters and the header
 * groups (fonts, colors, styles, pictures) that carry no text.
 */

const SKIPPED_GROUPS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "header",
  "footer",
  "headerl",
  "headerr",
  "footerl",
  "footerr",
]);

const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

/** One Windows-1252 byte as text (the PDF reader's WinAnsi fallback too). */
export function cp1252(byte: number): string {
  return byte >= 0x80 && byte <= 0x9f
    ? CP1252_HIGH[byte - 0x80]
    : String.fromCharCode(byte);
}

/**
 * A dish description or note that wraps is saved as more paragraphs set right
 * under it (no space above, \sb0) at a line height of 10 points (200 twips)
 * or less. Those join the line above, as the BEO PDF reader joins the same
 * lines by their small gap; otherwise only a description's first line would
 * reach its dish. Header and timeline rows are taller or spaced, so they stay.
 */
const WRAP_LINE_HEIGHT = 200;

interface LineSpacing {
  /** Space above, in twips (\sb). */
  before: number;
  /** Line height, in twips (\sl, sign dropped); 0 when not set. */
  height: number;
}

function isWrap(line: LineSpacing, previous: LineSpacing): boolean {
  const small = (spacing: LineSpacing) =>
    spacing.height > 0 && spacing.height <= WRAP_LINE_HEIGHT;
  return line.before === 0 && small(line) && small(previous);
}

export function isRtf(text: string): boolean {
  return text.trimStart().startsWith("{\\rtf");
}

export function rtfToText(rtf: string): string {
  let out = "";
  // One entry per open group: is it skipped, and its \uc fallback length.
  const groups: { skip: boolean; uc: number }[] = [{ skip: false, uc: 1 }];
  let pendingFallback = 0;
  let i = 0;
  /** The spacing of each finished line, and of the paragraph being read. */
  const spacing: LineSpacing[] = [];
  let paragraph: LineSpacing = { before: 0, height: 0 };
  const top = () => groups[groups.length - 1];
  const emit = (text: string) => {
    if (!top().skip) out += text;
  };
  const breakLine = () => {
    if (top().skip) return;
    out += "\n";
    spacing.push(paragraph);
  };
  while (i < rtf.length) {
    const ch = rtf[i];
    if (ch === "{") {
      groups.push({ ...top() });
      i += 1;
    } else if (ch === "}") {
      if (groups.length > 1) groups.pop();
      i += 1;
    } else if (ch === "\\") {
      const next = rtf[i + 1];
      if (next === "'") {
        const byte = parseInt(rtf.slice(i + 2, i + 4), 16);
        i += 4;
        if (pendingFallback > 0) pendingFallback -= 1;
        else if (!Number.isNaN(byte)) emit(cp1252(byte));
      } else if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        i += 2;
      } else if (next === "*") {
        top().skip = true;
        i += 2;
      } else if (next === "~") {
        emit(" ");
        i += 2;
      } else if (next === "\n" || next === "\r") {
        breakLine();
        i += 2;
      } else {
        const word = /^([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i + 1, i + 40));
        if (!word) {
          i += 2;
          continue;
        }
        i += 1 + word[0].length;
        const [, name, arg] = word;
        if (SKIPPED_GROUPS.has(name)) top().skip = true;
        else if (name === "par" || name === "line" || name === "row")
          breakLine();
        else if (name === "pard") paragraph = { before: 0, height: 0 };
        else if (name === "sb")
          paragraph = { ...paragraph, before: Number(arg ?? 0) };
        else if (name === "sl")
          paragraph = { ...paragraph, height: Math.abs(Number(arg ?? 0)) };
        else if (name === "tab" || name === "cell") emit("\t");
        // Punctuation TPP writes as control words; dropping the dash between
        // two times loses the event's end time.
        else if (name === "endash") emit("\u2013");
        else if (name === "emdash") emit("\u2014");
        else if (name === "lquote" || name === "rquote") emit("'");
        else if (name === "ldblquote" || name === "rdblquote") emit('"');
        else if (name === "bullet") emit("\u2022");
        else if (name === "uc") top().uc = Number(arg ?? 1);
        else if (name === "u" && arg !== undefined) {
          const code = Number(arg);
          emit(String.fromCharCode(code < 0 ? code + 65536 : code));
          pendingFallback = top().uc;
        }
      }
    } else if (ch === "\r" || ch === "\n") {
      i += 1;
    } else {
      if (pendingFallback > 0) pendingFallback -= 1;
      else emit(ch);
      i += 1;
    }
  }
  spacing.push(paragraph);
  const lines: string[] = [];
  out.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\t+/g, "  ").trim();
    const previous = spacing[index - 1];
    if (lines.length === 0 || !previous || !isWrap(spacing[index]!, previous)) {
      lines.push(line);
    } else if (line) {
      lines[lines.length - 1] = `${lines.at(-1)} ${line}`.trim();
    }
  });
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
