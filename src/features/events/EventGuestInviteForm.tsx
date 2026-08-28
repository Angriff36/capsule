import type { FormEvent } from "react";

type Props = {
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDismiss: () => void;
};

/**
 * Invite-a-guest form. Presentation only — the panel owns the generated
 * EventGuest creation command and passes the submit handler down.
 */
export function EventGuestInviteForm({ busy, onSubmit, onDismiss }: Props) {
  return (
    <form
      onSubmit={onSubmit}
      className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="field-label">
        Guest name
        <input name="name" className="input" required autoFocus />
      </label>
      <label className="field-label">
        Email
        <input name="email" type="email" className="input" />
      </label>
      <label className="field-label">
        Phone
        <input name="phone" type="tel" className="input" />
      </label>
      <label className="field-label">
        Dietary restrictions
        <input
          name="dietaryRestrictions"
          className="input"
          placeholder="One per comma — e.g. vegan, gluten-free"
        />
      </label>
      <label className="field-label">
        Allergens
        <input
          name="allergenRestrictions"
          className="input"
          placeholder="One per comma — e.g. peanuts, shellfish"
        />
      </label>
      <label className="field-label">
        Accessibility needs
        <input
          name="accessibilityNeeds"
          className="input"
          placeholder="One per comma — e.g. wheelchair access"
        />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-base text-ink-2">
        <input name="specialMealRequired" type="checkbox" /> Special meal
        required
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Inviting…" : "Invite guest"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </form>
  );
}
