import { CulinaryEntityLink } from "../../kitchen/CulinaryEntityLink";
import type { TppDocumentSection } from "./types";

export function TppReportDocument({
  sections,
  template,
}: {
  sections: readonly TppDocumentSection[];
  template: string;
}) {
  const production =
    template === "master-food-production-worksheet" ||
    template === "event-menu-item-production";
  return (
    <div
      className={`tpp-document${production ? " tpp-document--production" : ""}`}
    >
      {sections.map((section) => (
        <section key={section.id} className="print:break-inside-avoid">
          {section.printContext ? (
            <p className="tpp-document-print-context hidden print:block">
              {section.printContext}
            </p>
          ) : null}
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
              <div
                key={`${section.id}-${index}`}
                className="print:break-inside-avoid"
              >
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
