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
          {section.heading ? <h3>{section.heading}</h3> : null}
          <dl>
            {section.rows.map((row, index) => (
              <div key={`${section.id}-${index}`}>
                <dt>{row.label ?? ""}</dt>
                <dd>{row.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
