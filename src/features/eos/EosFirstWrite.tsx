import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EOS_PATHS } from "./eosModel";
import { useRun } from "./EosShared";
import { useCompanyVision, useSaveVision } from "./useEosData";

type OpeningField = {
  key: "coreFocusPurpose" | "coreFocusNiche";
  label: string;
  placeholder: string;
};

/** The first blank line on Start here. Purpose, then niche, then Vision. */
export class EosOpeningLine {
  static next(
    vision: {
      coreFocusPurpose?: string | null;
      coreFocusNiche?: string | null;
    } | null,
  ): OpeningField | null {
    if (!vision?.coreFocusPurpose?.trim()) {
      return {
        key: "coreFocusPurpose",
        label: "Why Mangia exists",
        placeholder: "e.g. Feed people well, every time",
      };
    }
    if (!vision?.coreFocusNiche?.trim()) {
      return {
        key: "coreFocusNiche",
        label: "What Mangia does best",
        placeholder: "e.g. Full-service catering for weddings and corporate",
      };
    }
    return null;
  }
}

/**
 * A real typing box on EOS home so "write where Mangia is going" is not a
 * scavenger hunt. After purpose and niche are in, Vision has the rest.
 */
export function EosFirstWrite() {
  const vision = useCompanyVision();
  const save = useSaveVision(vision);
  const { run, busy, banner } = useRun();
  const field = vision === undefined ? null : EosOpeningLine.next(vision);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft("");
  }, [field?.key]);

  if (vision === undefined) return null;
  if (!field) {
    return (
      <div className="px-4 pb-6">
        <Link to={EOS_PATHS.vision} className="btn btn-primary">
          Keep writing on Vision
        </Link>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    void run(() => save({ [field.key]: text }));
  };

  return (
    <form className="grid gap-2 px-4 pb-6" onSubmit={submit}>
      {banner}
      <label className="field-label">
        {field.label}
        <textarea
          className="input mt-1"
          rows={3}
          autoFocus
          value={draft}
          placeholder={field.placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !draft.trim()}
        >
          Save
        </button>
      </div>
    </form>
  );
}
