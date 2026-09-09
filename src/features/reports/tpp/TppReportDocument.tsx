import { CulinaryEntityLink } from "../../kitchen/CulinaryEntityLink";
import type { TppDocumentSection } from "./types";

export function TppReportDocument({
  sections,
}: {
  sections: readonly TppDocumentSection[];
}) {
  return (
    <div className="tpp-document">
      {sections.map((section) => (
        <section key={section.id}>
          {section.heading ? (
            section.headingLevel === 4 ? (
              <h4 className="py-2 text-base font-semibold">
                {section.heading}
              </h4>
            ) : (
              <h3>{section.heading}</h3>
            )
          ) : null}
          <dl>
            {section.rows.map((row, index) => (
              <div key={`${section.id}-${index}`}>
                <dt>{row.label ?? ""}</dt>
                <dd className="whitespace-pre-line">
                  {row.recipe ? (
                    <CulinaryEntityLink
                      kind={row.recipe.kind}
                      id={row.recipe.id}
                    >
                      {row.value || "Open recipe"}
                    </CulinaryEntityLink>
                  ) : (
                    row.value || "—"
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
