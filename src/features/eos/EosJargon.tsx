import { useState } from "react";

/** Plain-language meanings for EOS words on Start here. */
export class EosJargonGlossary {
  static readonly rocks = "The few big things to finish in the next 90 days.";
  static readonly l10 = "The weekly leadership meeting.";
}

/**
 * A dotted jargon word. Hover or focus shows what it means. Uses the same
 * panel look as FieldHelp, without the kitchen cascade.
 */
export function EosJargon({ term, means }: { term: string; means: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="field-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <abbr
        className="eos-jargon"
        tabIndex={0}
        aria-label={`${term}: ${means}`}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {term}
      </abbr>
      {open ? (
        <span role="tooltip" className="field-help-panel">
          <span className="field-help-title">{term}</span>
          <span className="block">{means}</span>
        </span>
      ) : null}
    </span>
  );
}
