import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DesignContractGate } from "../scripts/check-design-vocab";

/** DESIGN.md front matter, trimmed to the blocks the gate reads. */
function designMd(
  overrides: { canvas?: string; display?: string; xs?: string } = {},
): string {
  const {
    canvas = "#dfe8da",
    display = "Iowan Old Style",
    xs = "3px",
  } = overrides;
  return [
    "---",
    "name: CapsuleX",
    "colors:",
    `  canvas: "${canvas}"`,
    '  brand: "#31574f"',
    "typography:",
    "  section-display:",
    `    fontFamily: ${display}`,
    "    fontSize: 30px",
    "  body:",
    "    fontFamily: Archivo Variable",
    "    fontSize: 15px",
    "  mono-data:",
    "    fontFamily: IBM Plex Mono",
    "    fontSize: 13px",
    "rounded:",
    `  xs: ${xs}`,
    "---",
    "",
    "# Design",
  ].join("\n");
}

/** app.css, trimmed to the @theme block the gate reads. */
function appCss(
  overrides: { canvas?: string; display?: string; xs?: string } = {},
): string {
  const {
    canvas = "#dfe8da",
    display = '"Iowan Old Style", Georgia, serif',
    xs = "3px",
  } = overrides;
  return [
    '@import "tailwindcss";',
    "@theme {",
    '  --font-sans: "Archivo Variable", system-ui, sans-serif;',
    '  --font-mono: "IBM Plex Mono", ui-monospace, monospace;',
    `  --font-display: ${display};`,
    `  --color-canvas: ${canvas};`,
    "  --color-brand: #31574f;",
    `  --radius-xs: ${xs};`,
    "}",
    ".card {",
    "  border-radius: var(--radius-xs);",
    "}",
  ].join("\n");
}

describe("DesignContractGate", () => {
  function fixture(files: Record<string, string>): DesignContractGate {
    const root = mkdtempSync(path.join(tmpdir(), "capsule-design-contract-"));
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    }
    return new DesignContractGate(root);
  }

  it("passes when every app.css token matches DESIGN.md", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss(),
    });
    expect(gate.mismatches()).toEqual([]);
    expect(() => gate.enforce()).not.toThrow();
  });

  it("fails a mismatched color with the token, DESIGN.md value, and app.css value", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({ canvas: "#f3f2ee" }),
    });
    expect(gate.mismatches()).toEqual([
      { token: "--color-canvas", design: "#dfe8da", app: "#f3f2ee" },
    ]);
    expect(() => gate.enforce()).toThrow(/--color-canvas/);
    expect(() => gate.enforce()).toThrow(/#dfe8da/);
    expect(() => gate.enforce()).toThrow(/#f3f2ee/);
  });

  it("fails a display face swapped for the body sans — the 2026-08-24 drift", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({
        display: '"Archivo Variable", system-ui, sans-serif',
      }),
    });
    expect(gate.mismatches()).toEqual([
      {
        token: "--font-display",
        design: "Iowan Old Style",
        app: "Archivo Variable",
      },
    ]);
  });

  it("fails a mismatched radius", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({ xs: "4px" }),
    });
    expect(gate.mismatches()).toEqual([
      { token: "--radius-xs", design: "3px", app: "4px" },
    ]);
  });

  it("reports a token app.css never declares as absent", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss().replace("  --color-brand: #31574f;\n", ""),
    });
    expect(gate.mismatches()).toContainEqual({
      token: "--color-brand",
      design: "#31574f",
      app: "(absent)",
    });
  });

  it("takes expected values from DESIGN.md, not from app.css", () => {
    // Both files move together. The old gate read its answer key out of
    // app.css, so this stayed green; the contract gate must still fail.
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({ canvas: "#f3f2ee", xs: "4px" }),
    });
    expect(
      gate
        .mismatches()
        .map((m) => m.token)
        .sort(),
    ).toEqual(["--color-canvas", "--radius-xs"]);
  });

  it("passes once DESIGN.md is amended to the new value", () => {
    const gate = fixture({
      "DESIGN.md": designMd({ canvas: "#f3f2ee" }),
      "src/styles/app.css": appCss({ canvas: "#f3f2ee" }),
    });
    expect(gate.mismatches()).toEqual([]);
  });

  it("downgrades a recorded divergence to a report", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({ canvas: "#f3f2ee" }),
      "design-contract-exceptions.json": JSON.stringify({
        tokens: [
          {
            token: "--color-canvas",
            design: "#dfe8da",
            app: "#f3f2ee",
            reason: "owner decision pending",
          },
        ],
      }),
    });
    expect(() => gate.enforce()).not.toThrow();
  });

  it("still fails a divergence the exceptions file does not record", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({ canvas: "#f3f2ee", xs: "4px" }),
      "design-contract-exceptions.json": JSON.stringify({
        tokens: [
          {
            token: "--color-canvas",
            design: "#dfe8da",
            app: "#f3f2ee",
            reason: "owner decision pending",
          },
        ],
      }),
    });
    expect(() => gate.enforce()).toThrow(/--radius-xs/);
  });

  it("fails a stale exception so the list cannot rot", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss(),
      "design-contract-exceptions.json": JSON.stringify({
        tokens: [
          {
            token: "--color-canvas",
            design: "#dfe8da",
            app: "#f3f2ee",
            reason: "already resolved",
          },
        ],
      }),
    });
    expect(() => gate.enforce()).toThrow(/stale/i);
  });

  it("slots a serif role by its family, not its name", () => {
    // `breadcrumb` is serif but is neither a -display nor a -heading. Slotting
    // by role name put it in the sans slot and blew up on a false ambiguity.
    const withBreadcrumb = designMd().replace(
      "typography:\n",
      "typography:\n  breadcrumb:\n    fontFamily: Iowan Old Style\n",
    );
    const gate = fixture({
      "DESIGN.md": withBreadcrumb,
      "src/styles/app.css": appCss(),
    });
    expect(() => gate.designContract()).not.toThrow();
    expect(gate.designContract().fonts.get("display")).toBe("Iowan Old Style");
    expect(gate.designContract().fonts.get("sans")).toBe("Archivo Variable");
    expect(gate.mismatches()).toEqual([]);
  });

  it("rejects DESIGN.md declaring two display faces", () => {
    const twoSerifs = designMd().replace(
      "typography:\n",
      "typography:\n  breadcrumb:\n    fontFamily: Cormorant Garamond\n",
    );
    const gate = fixture({
      "DESIGN.md": twoSerifs,
      "src/styles/app.css": appCss(),
    });
    expect(() => gate.designContract()).toThrow(/more than one display face/);
  });

  it("rejects an exception entry with no reason", () => {
    const gate = fixture({
      "DESIGN.md": designMd(),
      "src/styles/app.css": appCss({ canvas: "#f3f2ee" }),
      "design-contract-exceptions.json": JSON.stringify({
        tokens: [
          { token: "--color-canvas", design: "#dfe8da", app: "#f3f2ee" },
        ],
      }),
    });
    expect(() => gate.enforce()).toThrow(/reason/);
  });
});

describe("DesignContractGate against the real repository", () => {
  it("keeps every live divergence recorded in the exceptions file", () => {
    const gate = new DesignContractGate();
    // Not "no mismatches" — the app currently diverges. The contract is that
    // every divergence is written down, so none of it is silent.
    expect(() => gate.enforce()).not.toThrow();
  });
});

describe("DesignContractGate type floor", () => {
  it("fails a --text-* step below the smallest DESIGN.md role", () => {
    // The floor was prose in DESIGN.md that nothing checked, so 11px survived
    // in 44 files while the gate stayed green.
    const root = mkdtempSync(path.join(tmpdir(), "capsule-type-floor-"));
    mkdirSync(path.join(root, "src/styles"), { recursive: true });
    writeFileSync(path.join(root, "DESIGN.md"), designMd(), "utf8");
    writeFileSync(
      path.join(root, "src/styles/app.css"),
      appCss().replace("@theme {", "@theme {\n  --text-2xs: 11px;"),
      "utf8",
    );
    const gate = new DesignContractGate(root);
    expect(gate.mismatches()).toContainEqual({
      token: "--text-2xs",
      design: expect.stringContaining("type floor") as unknown as string,
      app: "11px",
    });
  });

  it("passes a --text-* step at the floor", () => {
    const root = mkdtempSync(path.join(tmpdir(), "capsule-type-floor-ok-"));
    mkdirSync(path.join(root, "src/styles"), { recursive: true });
    writeFileSync(path.join(root, "DESIGN.md"), designMd(), "utf8");
    writeFileSync(
      path.join(root, "src/styles/app.css"),
      appCss().replace("@theme {", "@theme {\n  --text-2xs: 13px;"),
      "utf8",
    );
    expect(new DesignContractGate(root).mismatches()).toEqual([]);
  });
});
