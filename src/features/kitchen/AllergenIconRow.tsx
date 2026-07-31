import {
  CULINARY_ALLERGENS,
  type CulinaryAllergenCode,
} from "./CulinaryAllergenVocabulary";

const LETTER: Record<CulinaryAllergenCode, string> = {
  milk: "M",
  eggs: "E",
  fish: "F",
  crustacean_shellfish: "C",
  tree_nuts: "TN",
  peanuts: "P",
  wheat: "W",
  soybeans: "S",
  sesame: "Se",
};

type Props = {
  codes: readonly string[] | null | undefined;
  className?: string;
};

/** Compact allergen badges: letter + accessible name (not color-only). */
export function AllergenIconRow({ codes, className }: Props) {
  const resolved = (codes ?? [])
    .map((code) => CULINARY_ALLERGENS.find((entry) => entry.code === code))
    .filter((entry): entry is (typeof CULINARY_ALLERGENS)[number] => !!entry);

  if (resolved.length === 0) {
    return (
      <span
        className={className ?? "text-xs text-ink-3"}
        aria-label="No allergens listed"
      >
        —
      </span>
    );
  }

  return (
    <ul
      className={`flex flex-wrap gap-1 ${className ?? ""}`}
      aria-label={`Allergens: ${resolved.map((a) => a.label).join(", ")}`}
    >
      {resolved.map((allergen) => (
        <li key={allergen.code}>
          <span
            className="inline-flex min-w-[1.5rem] items-center justify-center rounded-xs border border-line bg-inset px-1 py-0.5 font-mono text-2xs font-semibold text-ink"
            title={allergen.label}
            aria-label={allergen.label}
          >
            {LETTER[allergen.code]}
          </span>
        </li>
      ))}
    </ul>
  );
}
