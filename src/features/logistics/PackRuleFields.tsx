import { PACK_EVENT_FACTS } from "../../lib/packRules";
import { PACK_LIST_UNITS } from "./packListUnits";
import { packCategoryLabel } from "./packLineExplanation";
import {
  PACK_CATEGORIES,
  PACK_RULE_TRIGGERS,
  type PackRuleDraft,
} from "./packRuleDraft";

type Option = { _id: string; name: string };

/** The inputs of one pack rule: used to add a rule and to edit one. Only
 * the inputs the chosen "when" needs are shown. */
export function PackRuleFields({
  draft,
  dishes,
  styles,
  disabled,
  onChange,
}: {
  draft: PackRuleDraft;
  dishes: Option[];
  styles: Option[];
  disabled: boolean;
  onChange: (patch: Partial<PackRuleDraft>) => void;
}) {
  const t = draft.trigger;
  const select = (
    label: string,
    value: string,
    options: Array<{ value: string; label: string }>,
    patch: (value: string) => Partial<PackRuleDraft>,
  ) => (
    <label className="field-label">
      <span>{label}</span>
      <select
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(patch(e.target.value))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (
    label: string,
    value: string,
    patch: (value: string) => Partial<PackRuleDraft>,
    extra: { type?: string; placeholder?: string } = {},
  ) => (
    <label className="field-label">
      <span>{label}</span>
      <input
        className="input"
        type={extra.type ?? "text"}
        min={extra.type === "number" ? 0 : undefined}
        value={value}
        placeholder={extra.placeholder}
        disabled={disabled}
        onChange={(e) => onChange(patch(e.target.value))}
      />
    </label>
  );
  return (
    <>
      {select("When", t, [...PACK_RULE_TRIGGERS], (trigger) => ({ trigger }))}
      {t === "dish" || t === "production_note"
        ? select(
            t === "dish" ? "Dish" : "Only for this dish (optional)",
            draft.dishId,
            [
              { value: "", label: t === "dish" ? "Pick a dish" : "Any dish" },
              ...dishes.map((dish) => ({ value: dish._id, label: dish.name })),
            ],
            (dishId) => ({ dishId }),
          )
        : null}
      {t === "service_style"
        ? select(
            "Service style",
            draft.serviceStyleId,
            [
              { value: "", label: "Pick a style" },
              ...styles.map((style) => ({
                value: style._id,
                label: style.name,
              })),
            ],
            (serviceStyleId) => ({ serviceStyleId }),
          )
        : null}
      {t === "event_fact"
        ? select(
            "Event answer",
            draft.matchFact,
            [
              { value: "", label: "Pick an answer" },
              ...PACK_EVENT_FACTS.map((fact) => ({
                value: fact.key,
                label: fact.label,
              })),
            ],
            (matchFact) => ({ matchFact }),
          )
        : null}
      {t === "event_fact" || t === "production_note"
        ? input(
            t === "production_note"
              ? "Words in the note"
              : "Words in the answer (optional)",
            draft.matchText,
            (matchText) => ({ matchText }),
            {
              placeholder:
                t === "production_note" ? "e.g. in cones" : "e.g. grass",
            },
          )
        : null}
      {input("Item", draft.description, (description) => ({ description }), {
        placeholder: "e.g. Paper cones",
      })}
      {select(
        "Kind",
        draft.category,
        PACK_CATEGORIES.map((category) => ({
          value: category,
          label: packCategoryLabel(category),
        })),
        (category) => ({ category }),
      )}
      {select(
        "Unit",
        draft.unit,
        PACK_LIST_UNITS.map((unit) => ({ value: unit, label: unit })),
        (unit) => ({ unit }),
      )}
      {input(
        "Always send",
        draft.baseQuantity,
        (baseQuantity) => ({ baseQuantity }),
        { type: "number" },
      )}
      {select(
        "Grows with",
        draft.scaleBy,
        [
          { value: "fixed", label: "Nothing (set amount)" },
          ...(t === "dish" || t === "production_note"
            ? [{ value: "servings", label: "Servings of the dish" }]
            : []),
          { value: "guests", label: "Guests" },
        ],
        (scaleBy) => ({ scaleBy }),
      )}
      {draft.scaleBy !== "fixed"
        ? input("One more per", draft.perUnits, (perUnits) => ({ perUnits }), {
            type: "number",
            placeholder: "e.g. 10",
          })
        : null}
      {draft.scaleBy !== "fixed"
        ? input(
            "Spare %",
            draft.sparePercent,
            (sparePercent) => ({ sparePercent }),
            {
              type: "number",
              placeholder: "e.g. 10",
            },
          )
        : null}
      {select(
        "Whose",
        draft.ownership,
        [
          { value: "owned", label: "Ours" },
          { value: "rented", label: "Rented" },
          { value: "client", label: "The client's" },
        ],
        (ownership) => ({ ownership }),
      )}
      {select(
        "After the event",
        draft.returnRequired ? "yes" : "no",
        [
          { value: "yes", label: "Comes back" },
          { value: "no", label: "Does not come back" },
        ],
        (value) => ({ returnRequired: value === "yes" }),
      )}
      {draft.returnRequired
        ? input(
            "Who takes it back (optional)",
            draft.returnNote,
            (returnNote) => ({ returnNote }),
            {
              placeholder: "e.g. Party Rentals pick up Monday",
            },
          )
        : null}
      {select(
        "Must-have",
        draft.requiredCapability ? "yes" : "no",
        [
          { value: "no", label: "No" },
          { value: "yes", label: "Yes - leaving it off needs a stand-in" },
        ],
        (value) => ({ requiredCapability: value === "yes" }),
      )}
    </>
  );
}
