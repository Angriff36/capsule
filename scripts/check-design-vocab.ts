/**
 * Two gates, one command.
 *
 * 1. DesignContractGate — does app.css still say what DESIGN.md says?
 *
 *    DESIGN.md is the presentation authority (docs/product/authority.md). Its
 *    YAML front matter carries the authoritative colors, type faces, and radii.
 *    This gate reads those values from DESIGN.md and compares them to the
 *    `@theme` tokens in app.css. Expected values never come from app.css —
 *    that was the defect: the old gate read its own answer key out of the file
 *    it was checking, so rewriting a token rewrote the rule and the gate
 *    stayed green while the UI walked away from DESIGN.md (909bc59, f8649bb,
 *    2026-08-24).
 *
 *    To change the design you must change DESIGN.md. That makes the override a
 *    reviewable diff instead of a silent one. A divergence that the owner has
 *    accepted but not yet resolved lives in design-contract-exceptions.json,
 *    one entry per token, with a reason — never a blanket skip. A stale entry
 *    (app.css now matches DESIGN.md, or drifted to some third value) is itself
 *    a failure, so the list cannot rot.
 *
 * 2. DesignVocabGate — do call sites stay inside the declared vocabulary?
 *
 *    Screens stop matching each other when a size, a corner radius, or a color
 *    is invented at the call site instead of taken from app.css. Each single
 *    choice looks reasonable in review, so nothing catches it — this does.
 *    Three rules, over the token NAMES app.css declares (gate 1 owns the
 *    values):
 *
 *      1. text  — only the --text-* steps. No `text-[13px]`, no Tailwind step
 *                 we do not declare (it resolves from Tailwind's rem defaults).
 *      2. round — only the --radius-* steps plus `rounded-full`. No
 *                 `rounded-lg`, no `rounded-[10px]`.
 *      3. color — bg-/text-/border-/... must name a declared --color-* token, a
 *                 Tailwind built-in palette color, or a non-color utility word.
 *                 A typo like `bg-paper` renders with NO background at all.
 *
 * Run via `bun scripts/check-design-vocab.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const SCANNED = new Set([".tsx", ".ts", ".css"]);
const APP_CSS = "src/styles/app.css";
const DESIGN_MD = "DESIGN.md";
const EXCEPTIONS = "design-contract-exceptions.json";

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

/** A token whose app.css value does not match the DESIGN.md value. */
export type Mismatch = { token: string; design: string; app: string };
/** One accepted, recorded divergence. `app` pins the value it was accepted at. */
type Exception = {
  token: string;
  design: string;
  app: string;
  reason: string;
};

/** DESIGN.md front matter maps a role (`body`, `mono-data`) to a face. app.css
 *  declares three slots. A role naming a mono family is the mono slot; a
 *  `-display`/`-heading` role is the display slot; everything else is sans. */
function fontSlot(role: string, family: string): "sans" | "mono" | "display" {
  if (/mono/i.test(family)) return "mono";
  return /-(display|heading)$/.test(role) ? "display" : "sans";
}

/** First family in a CSS font stack, unquoted: `"Iowan Old Style", Georgia`. */
function firstFamily(stack: string): string {
  return (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/**
 * Compare the `@theme` tokens in app.css against the authoritative values in
 * the DESIGN.md front matter.
 */
export class DesignContractGate {
  constructor(private readonly root = process.cwd()) {}

  enforce(): void {
    const mismatches = this.mismatches();
    const accepted = this.exceptions();
    const key = (m: Mismatch) => `${m.token} ${m.design} ${m.app}`;
    const acceptedKeys = new Set(accepted.map(key));

    const unaccepted = mismatches.filter((m) => !acceptedKeys.has(key(m)));
    // An entry that no longer describes reality is a failure of its own: the
    // token was fixed, or drifted again, and nobody revisited the list.
    const live = new Set(mismatches.map(key));
    const stale = accepted.filter((e) => !live.has(key(e)));

    const problems: string[] = [];
    if (unaccepted.length > 0) {
      problems.push(
        `${unaccepted.length} token(s) contradict ${DESIGN_MD}:\n` +
          unaccepted
            .map(
              (m) =>
                `  ${m.token}\n      ${DESIGN_MD}: ${m.design}\n      ${APP_CSS}: ${m.app}`,
            )
            .join("\n"),
      );
    }
    if (stale.length > 0) {
      problems.push(
        `${stale.length} stale entr(ies) in ${EXCEPTIONS} — the token no longer ` +
          `has the recorded value. Re-check and remove or update:\n` +
          stale.map((e) => `  ${e.token} (recorded ${e.app})`).join("\n"),
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `${problems.join("\n\n")}\n\n` +
          `${DESIGN_MD} is the presentation authority. Change the design there ` +
          `first, with owner approval, then move the token. Do not change the ` +
          `token alone.`,
      );
    }
    console.log(
      `design contract: app.css matches ${DESIGN_MD}` +
        (accepted.length > 0
          ? ` (${accepted.length} recorded divergence(s) in ${EXCEPTIONS})`
          : ""),
    );
  }

  /** Every token in DESIGN.md whose app.css value differs or is absent. */
  mismatches(): Mismatch[] {
    const design = this.designContract();
    const theme = this.themeTokens();
    const out: Mismatch[] = [];
    const compare = (token: string, want: string, got: string | undefined) => {
      const has = got ?? "(absent)";
      if (has.toLowerCase() !== want.toLowerCase()) {
        out.push({ token, design: want, app: has });
      }
    };
    for (const [name, value] of design.colors) {
      compare(`--color-${name}`, value, theme.get(`color-${name}`));
    }
    for (const [name, value] of design.radii) {
      compare(`--radius-${name}`, value, theme.get(`radius-${name}`));
    }
    for (const [slot, family] of design.fonts) {
      const stack = theme.get(`font-${slot}`);
      compare(
        `--font-${slot}`,
        family,
        stack === undefined ? undefined : firstFamily(stack),
      );
    }
    return out;
  }

  /** Authoritative colors, radii, and font slots from the DESIGN.md front matter. */
  designContract(): {
    colors: Map<string, string>;
    radii: Map<string, string>;
    fonts: Map<string, string>;
  } {
    const text = readFileSync(resolve(this.root, DESIGN_MD), "utf8");
    const matter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
    if (matter === undefined) {
      throw new Error(`${DESIGN_MD} has no YAML front matter to read.`);
    }
    const doc = parseYaml(matter) as {
      colors?: Record<string, string>;
      rounded?: Record<string, string>;
      typography?: Record<string, { fontFamily?: string }>;
    };
    const scalars = (
      block: Record<string, unknown> | undefined,
      what: string,
    ) => {
      const entries = Object.entries(block ?? {});
      if (entries.length === 0) {
        throw new Error(`${DESIGN_MD} declares no ${what}.`);
      }
      return new Map(entries.map(([k, v]) => [k, String(v)]));
    };

    // One family per slot. Two different families claiming one slot means
    // DESIGN.md itself is ambiguous — say so rather than pick.
    const fonts = new Map<string, string>();
    for (const [role, spec] of Object.entries(doc.typography ?? {})) {
      const family = spec?.fontFamily;
      if (family === undefined) continue;
      const slot = fontSlot(role, family);
      const held = fonts.get(slot);
      if (held !== undefined && held !== family) {
        throw new Error(
          `${DESIGN_MD} typography gives the ${slot} slot two faces: ` +
            `"${held}" and "${family}" (role "${role}").`,
        );
      }
      fonts.set(slot, family);
    }
    if (fonts.size === 0) {
      throw new Error(`${DESIGN_MD} declares no typography fontFamily.`);
    }
    return {
      colors: scalars(doc.colors, "colors"),
      radii: scalars(doc.rounded, "rounded radii"),
      fonts,
    };
  }

  /** `--name: value` pairs inside the first `@theme { … }` block of app.css. */
  themeTokens(): Map<string, string> {
    const css = readFileSync(resolve(this.root, APP_CSS), "utf8");
    const at = css.indexOf("@theme");
    const open = at === -1 ? -1 : css.indexOf("{", at);
    if (open === -1) {
      throw new Error(`${APP_CSS} has no @theme block.`);
    }
    let depth = 0;
    let close = -1;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) {
        close = i;
        break;
      }
    }
    if (close === -1) {
      throw new Error(`${APP_CSS} has an unterminated @theme block.`);
    }
    const block = css.slice(open + 1, close);
    const tokens = new Map<string, string>();
    for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      tokens.set(name as string, (value as string).trim().replace(/\s+/g, " "));
    }
    return tokens;
  }

  /** Recorded divergences. Absent file = none accepted. */
  exceptions(): Exception[] {
    let text: string;
    try {
      text = readFileSync(resolve(this.root, EXCEPTIONS), "utf8");
    } catch {
      return [];
    }
    const doc = JSON.parse(text) as { tokens?: Exception[] };
    return (doc.tokens ?? []).map((entry) => {
      for (const field of ["token", "design", "app", "reason"] as const) {
        if (typeof entry?.[field] !== "string" || entry[field].length === 0) {
          throw new Error(
            `${EXCEPTIONS}: every entry needs a non-empty "${field}".`,
          );
        }
      }
      return entry;
    });
  }
}

type Offence = { file: string; line: number; found: string; why: string };
type Vocab = {
  sizes: Set<string>;
  radii: Set<string>;
  colors: Set<string>;
  authored: Set<string>;
};

export class DesignVocabGate {
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

if (import.meta.main) {
  // Contract first: a token that contradicts DESIGN.md makes every call-site
  // report below it a report about the wrong vocabulary.
  new DesignContractGate().enforce();
  new DesignVocabGate().enforce();
}
