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
  });

  it("VALUE column cannot shrink below 7.5rem (QA clip of 500000 → 500()", () => {
    expect(css).toContain(".lead-card-editor input[name=\"estimatedValue\"]");
    expect(css).toContain("min-width: 7.5rem");
    expect(css).toContain("minmax(7.5rem");
    expect(css).not.toMatch(
      /\.lead-card-editor \{\s*display: grid;\s*grid-template-columns: 1\.3fr 0\.85fr 0\.7fr auto;/,
    );
  });

  it("hides number spinners so they do not eat the amount", () => {
    expect(css).toContain("appearance: textfield");
    expect(css).toContain("::-webkit-inner-spin-button");
  });
});
