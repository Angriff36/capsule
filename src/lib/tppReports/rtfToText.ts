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

function cp1252(byte: number): string {
  return byte >= 0x80 && byte <= 0x9f
    ? CP1252_HIGH[byte - 0x80]
    : String.fromCharCode(byte);
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
  const top = () => groups[groups.length - 1];
  const emit = (text: string) => {
    if (!top().skip) out += text;
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
        emit("\n");
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
          emit("\n");
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
  return out
    .split("\n")
    .map((line) => line.replace(/\t+/g, "  ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
