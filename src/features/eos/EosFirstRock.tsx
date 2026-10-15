import { useState, type FormEvent } from "react";
import { useCreateLeadershipItem } from "@/lib/manifest-convex-react";
import { EosJargon, EosJargonGlossary } from "./EosJargon";
import { useRun } from "./EosShared";

/**
 * A real typing box on EOS home so "set this quarter's Rocks" is not a
 * scavenger hunt through the weekly meeting page.
 */
export function EosFirstRock() {
  const addItem = useCreateLeadershipItem();
  const { run, busy, banner } = useRun();
  const [draft, setDraft] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    void run(() => addItem({ kind: "rock", title })).then((ok) => {
      if (ok) setDraft("");
    });
  };

  return (
    <form className="grid gap-2 px-4 pb-6" onSubmit={submit}>
      {banner}
      <label className="field-label">
        This quarter's <EosJargon term="Rock" means={EosJargonGlossary.rocks} />
        <input
          className="input mt-1"
          autoFocus
          value={draft}
          placeholder="What must be done this quarter"
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
