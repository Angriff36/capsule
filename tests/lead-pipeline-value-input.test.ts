import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("lead pipeline card VALUE input", () => {
  const css = readFileSync(
    path.join(process.cwd(), "src/features/clients/LeadPipelinePage.css"),
    "utf8",
  );
  const page = readFileSync(
    path.join(process.cwd(), "src/features/clients/LeadPipelinePage.tsx"),
    "utf8",
  );

  it("card editor VALUE is a named estimatedValue number field", () => {
    expect(page).toContain('name="estimatedValue"');
    expect(page).toContain("lead-card-editor");
    expect(page).toContain('name="stage"');
  });

  it("VALUE column cannot shrink below 7.5rem (QA clip of 500000 → 500()", () => {
    expect(css).toContain('.lead-card-editor input[name="estimatedValue"]');
    expect(css).toContain("min-width: 7.5rem");
    expect(css).toContain("minmax(7.5rem");
    expect(css).not.toMatch(
      /\.lead-card-editor \{\s*display: grid;\s*grid-template-columns: 1\.3fr 0\.85fr 0\.7fr auto;/,
    );
  });

  it("Stage keeps a real min so a 268px column does not leave a 26px track", () => {
    // 8ad493a6: minmax(0, 1.15fr) Stage + 7.5rem Value + Chance + Save
    // left ~26px. "Proposal sent" clipped. Wrap at the column instead.
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container (max-width: 19.5rem)");
    expect(css).toContain("minmax(7rem, 1.15fr)");
    expect(css).toContain(".lead-card-editor select[name=\"stage\"]");
    expect(css).toContain("min-width: 7rem");
    expect(css).not.toContain("minmax(0, 1.15fr)");
    expect(css).not.toContain("minmax(26px");
    expect(css).not.toContain("Stage may shrink");
    expect(css).not.toMatch(
      /\.lead-card-editor \{[^}]*grid-template-columns: minmax\(0,/,
    );
  });

  it("hides number spinners so they do not eat the amount", () => {
    expect(css).toContain("appearance: textfield");
    expect(css).toContain("::-webkit-inner-spin-button");
  });
});
