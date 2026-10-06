import { useListServiceStyle } from "../../lib/manifest-convex-react";

/**
 * The service style a proposal template is for. A proposal started from an
 * event with that style picks this template by itself. Blank = any style.
 * A retired style already on the template stays listed so a save keeps it.
 */
export function ProposalTemplateServiceStyleField({
  value,
}: {
  value: string | null | undefined;
}) {
  const styles = (useListServiceStyle() ?? [])
    .filter(
      (style) =>
        style.deletedAt == null &&
        (style.status === "active" || style._id === value),
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return (
    <label className="field-label">
      For service style
      <select
        name="serviceStyleId"
        className="input"
        defaultValue={value ?? ""}
      >
        <option value="">Any service style</option>
        {styles.map((style) => (
          <option key={style._id} value={style._id}>
            {style.name}
            {style.status === "active" ? "" : " (retired)"}
          </option>
        ))}
      </select>
      <span className="field-help-note">
        A proposal made from an event with this style starts from this template.
      </span>
    </label>
  );
}
