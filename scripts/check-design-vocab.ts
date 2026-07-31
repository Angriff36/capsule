/**
 * Keep the app's visual vocabulary closed.
 *
 * Screens stop matching each other when a size, a corner radius, or a color is
 * invented at the call site instead of taken from src/styles/app.css. Each
 * single choice looks reasonable in review, so nothing catches it — this does.
 * Three rules, all read from app.css so the gate follows the tokens:
 *
 *   1. text  — only the --text-* steps. No `text-[13px]`, no Tailwind step we
 *              do not declare (it would resolve from Tailwind's rem defaults).
 *   2. round — only the --radius-* steps plus `rounded-full`. No `rounded-lg`,
 *              no `rounded-[10px]`.
 *   3. color — bg-/text-/border-/... must name a declared --color-* token, a
 *              Tailwind built-in palette color, or a non-color utility word.
 *              A typo like `bg-paper` renders with NO background at all.
 *
 * Need a value that is not there? Add the token to app.css, then every screen
 * can reach it. Run via `bun scripts/check-design-vocab.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SCANNED = new Set([".tsx", ".ts", ".css"]);
const APP_CSS = "src/styles/app.css";

/** Tailwind size steps: reject any that app.css does not declare. */
const SIZE_STEP = /^(?:2xs|xs|sm|base|lg|[2-9]?xl)$/;
/** Color-ish utility prefixes worth checking for a real token. */
const COLOR_PREFIX =
  /^(bg|text|border|divide|ring|fill|stroke|outline|decoration|placeholder|caret|from|via|to)-(.+)$/;
/** `text-[13px]` is a one-off size; `text-[var(--x)]` is a themed color. */
const ONE_OFF_LENGTH = /^\[\d+(?:\.\d+)?(?:px|rem|em)\]$/;
/** Tailwind's own palette plus keywords — legitimate without a Capsule token. */
const BUILTIN_COLOR =
  /^(?:white|black|transparent|current|inherit|none|initial|unset|auto|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?$/;
/** Non-color words that share a color prefix (text-left, border-2, to-90%…). */
const NON_COLOR_WORD =
  /^(?:left|right|center|justify|start|end|top|bottom|middle|baseline|wrap|nowrap|balance|pretty|ellipsis|clip|hidden|visible|collapse|separate|solid|dashed|dotted|double|none|inherit|auto|full|screen|fixed|local|scroll|clip|content|border|padding|box|width|height|x|y|t|b|l|r|s|e|se|sw|ne|nw|tl|tr|bl|br|\d+(?:\.\d+)?|\d+%|\[.*\])$/;

type Offence = { file: string; line: number; found: string; why: string };
type Vocab = {
  sizes: Set<string>;
  radii: Set<string>;
  colors: Set<string>;
  authored: Set<string>;
};

class DesignVocabGate {
  private readonly root: string;

  constructor(root = process.cwd()) {
    this.root = root;
  }

  enforce(): void {
    const css = readFileSync(resolve(this.root, APP_CSS), "utf8");
    const sizes = this.readTokens(css, "text", SIZE_STEP);
    const radii = this.readTokens(css, "radius");
    const colors = this.readTokens(css, "color");
    // Authored component classes (.text-link, .card, .chip…) are part of the
    // vocabulary too — they are declared once in app.css, which is the point.
    const authored = new Set(
      [...css.matchAll(/^\s*\.([a-z][\w-]*)/gm)].map(([, name]) => name),
    );
    const offences = this.scan(resolve(this.root, "src"), {
      sizes,
      radii,
      colors,
      authored,
    });
    if (offences.length > 0) {
      const lines = offences
        .slice(0, 40)
        .map((o) => `  ${o.file}:${o.line}  ${o.found}  — ${o.why}`);
      const more =
        offences.length > lines.length
          ? `\n  …and ${offences.length - lines.length} more`
          : "";
      throw new Error(
        `${offences.length} off-vocabulary class(es). Add the token to ${APP_CSS} ` +
          `or use an existing one.\n${lines.join("\n")}${more}`,
      );
    }
    console.log(
      `design vocab: ${sizes.size} text sizes, ${radii.size} radii, ${colors.size} colors (ok)`,
    );
  }

  /** Declared `--<family>-<name>` tokens. A repeated name is fatal: the later
   *  declaration wins, silently shifting every call site off the value above. */
  private readTokens(css: string, family: string, shape?: RegExp): Set<string> {
    const pattern = new RegExp(`--${family}-([\\w-]+):\\s*[^;]+;`, "g");
    const names = [...css.matchAll(pattern)]
      .map(([, name]) => name)
      .filter((name) => !name.includes("--") && (!shape || shape.test(name)));
    if (names.length === 0) {
      throw new Error(`No --${family}-* tokens in ${APP_CSS}.`);
    }
    const seen = new Set<string>();
    const duplicates = names.filter((name) => !seen.add(name));
    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate --${family}-* token(s) in ${APP_CSS}: ${duplicates.join(", ")}. ` +
          `Declare each once.`,
      );
    }
    return seen;
  }

  private scan(dir: string, vocab: Vocab): Offence[] {
    const found: Offence[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        found.push(...this.scan(path, vocab));
        continue;
      }
      if (!SCANNED.has(path.slice(path.lastIndexOf(".")))) continue;
      const file = relative(this.root, path).split("\\").join("/");
      const isScaleSource = file === APP_CSS;
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((text, index) => {
          for (const found_ of this.checkLine(text, vocab, isScaleSource)) {
            found.push({ ...found_, file, line: index + 1 });
          }
        });
    }
    return found;
  }

  /** Class candidates come from className/class attributes and @apply lines
   *  only — scanning whole lines would flag CSS property names and prose. */
  private checkLine(
    text: string,
    vocab: Vocab,
    isScaleSource: boolean,
  ): Omit<Offence, "file" | "line">[] {
    const sources = [
      ...[...text.matchAll(/class(?:Name)?\s*=\s*["'`{]([^"'`}]*)/g)].map(
        (m) => m[1] ?? "",
      ),
      ...[...text.matchAll(/@apply\s+([^;]*)/g)].map((m) => m[1] ?? ""),
      ...[
        ...text.matchAll(/["'`]([a-z0-9-]+(?:\s+[a-z0-9:/[\]-]+)+)["'`]/g),
      ].map((m) => m[1] ?? ""),
    ].join(" ");
    const out: Omit<Offence, "file" | "line">[] = [];
    for (const raw of sources.split(/\s+/)) {
      // Drop variant prefixes (sm: hover: dark:) and any /opacity suffix.
      const cls = (raw.split(":").pop() ?? "").split("/")[0] ?? "";
      if (cls.length === 0) continue;
      if (vocab.authored.has(cls)) continue;

      const size = /^text-(.+)$/.exec(cls)?.[1];
      if (size !== undefined) {
        if (ONE_OFF_LENGTH.test(size)) {
          out.push({ found: cls, why: "one-off text size" });
          continue;
        }
        if (SIZE_STEP.test(size) && !vocab.sizes.has(size)) {
          out.push({ found: cls, why: "text step not in the scale" });
          continue;
        }
      }

      const radius = /^rounded(?:-(.+))?$/.exec(cls);
      if (radius && !isScaleSource) {
        const step = radius[1];
        if (step === undefined) {
          out.push({ found: cls, why: "bare rounded; pick a step" });
          continue;
        }
        if (step !== "full" && !vocab.radii.has(step)) {
          out.push({ found: cls, why: "radius not in the scale" });
          continue;
        }
      }

      const color = COLOR_PREFIX.exec(cls);
      if (color && !isScaleSource) {
        const name = color[2] as string;
        const known =
          vocab.colors.has(name) ||
          BUILTIN_COLOR.test(name) ||
          NON_COLOR_WORD.test(name) ||
          vocab.sizes.has(name) ||
          vocab.radii.has(name) ||
          SIZE_STEP.test(name) ||
          name.startsWith("gradient-") ||
          name.includes("-"); // compound utilities (border-l-danger, to-90%)
        if (!known) {
          out.push({ found: cls, why: "no such color token" });
        }
      }
    }
    return out;
  }
}

new DesignVocabGate().enforce();
