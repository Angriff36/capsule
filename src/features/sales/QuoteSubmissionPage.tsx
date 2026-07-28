import { useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import { publicErrorMessage } from "../../lib/publicErrorMessage";
import { api, type Id } from "../../lib/api";
import { ArrowLeftIcon, CheckIcon } from "../../ui/icons";
import { FieldError, useFieldValidation } from "../../ui/formValidation";

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

// Coerce a form field into a branded Id (or undefined when empty).
function formId<T extends string>(
  value: FormDataEntryValue | null,
): T | undefined {
  const s = value == null ? "" : String(value);
  return s ? (s as T) : undefined;
}

function quoteFieldRules(data: FormData): Record<string, string> {
  const clientName = String(data.get("clientName") ?? "");
  const email = String(data.get("email") ?? "");
  const guestCount = Number(data.get("guestCount") ?? 0);
  const eventDate = String(data.get("eventDate") ?? "");

  const errors: Record<string, string> = {};

  if (!clientName.trim()) {
    errors.clientName = "Name is required";
  }

  if (!email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Please enter a valid email address";
  }

  if (!eventDate) {
    errors.eventDate = "Event date is required";
  } else {
    const date = new Date(eventDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      errors.eventDate = "Event date cannot be in the past";
    }
  }

  if (guestCount <= 0) {
    errors.guestCount = "Guest count must be at least 1";
  }

  const consent = data.get("consent");
  if (!consent) {
    errors.consent = "Please accept the data processing consent";
  }

  return errors;
}

/**
 * Public-facing quote submission form.
 *
 * Mobile-first responsive form for submitting event quote requests.
 * Creates Contact → Lead → Event → Proposal cascade via submitQuote action.
 *
 * Flow:
 * 1. User fills form (contact, event details, menu preferences, consent)
 * 2. Submit calls submitQuote action
 * 3. Backend creates Client, Lead, Event, Proposal (graceful failure at each step)
 * 4. Returns success with submission ID and status
 * 5. Shows thank you message with next steps
 */
export function QuoteSubmissionPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    submissionId: string;
    message: string;
  } | null>(null);

  // Public catalog read + submit via authored Convex functions: the generated
  // list hooks and a raw fetch both fail for an anonymous visitor (role-gated
  // queries return [], and /api/actions/<path> is not a real Convex route).
  const options = useQuery(api.quoteBuilder.getQuoteFormOptions);
  const submitQuote = useAction(api.quoteBuilder.submitQuote);

  const { errors, touched, formProps, handleSubmit } =
    useFieldValidation(quoteFieldRules);

  const activeServiceStyles = options?.serviceStyles ?? [];
  const activeOccasions = options?.occasions ?? [];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const data = new FormData(event.currentTarget);

    try {
      // Convert the date/time inputs to epoch-ms in the browser (local TZ) so
      // the UTC server stores the correct calendar day/time — mirrors the
      // Date.parse convention in EventPlanEngagementFormMapper. Sending raw
      // strings would let the server parse the date-only value as UTC midnight
      // and the date+time value as local, landing the event on the wrong day.
      const dateStr = String(data.get("eventDate") ?? "");
      const endTimeStr = String(data.get("eventEndTime") ?? "").trim();
      const result = await submitQuote({
        clientName: optional(String(data.get("clientName") ?? "")) ?? "",
        email: optional(String(data.get("email") ?? "")) ?? "",
        phone: optional(String(data.get("phone") ?? "")),
        eventDate: Date.parse(`${dateStr}T00:00`),
        eventEndTime: endTimeStr
          ? Date.parse(`${dateStr}T${endTimeStr}`)
          : undefined,
        guestCount: Number(data.get("guestCount") ?? 0),
        consent: data.get("consent") === "on",
        serviceStyleId: formId<Id<"serviceStyles">>(data.get("serviceStyleId")),
        occasionId: formId<Id<"occasions">>(data.get("occasionId")),
        venueName: optional(String(data.get("venueName") ?? "")),
        venueAddress: optional(String(data.get("venueAddress") ?? "")),
        menuPreferences: optional(String(data.get("menuPreferences") ?? "")),
        dietaryRestrictions: optional(
          String(data.get("dietaryRestrictions") ?? ""),
        ),
        notes: optional(String(data.get("notes") ?? "")),
      });

      setSuccess({
        submissionId: result.submissionId,
        message:
          result.message ||
          "Thank you! Your quote request has been submitted. We'll be in touch within 24-48 hours.",
      });
    } catch (err) {
      console.error("[quote-submission]", err);
      // Public page: never render the raw server error (it embeds the module
      // path, line number and request id). See src/lib/publicErrorMessage.ts.
      setError(
        publicErrorMessage(
          err,
          "We could not submit your request just now. Please try again, or contact us directly.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-panel rounded-lg shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-ok-soft rounded-full flex items-center justify-center mb-6">
            <CheckIcon className="w-8 h-8 text-ok" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-4">
            Quote Request Submitted
          </h1>
          <p className="text-ink-2 mb-6">{success.message}</p>
          <div className="text-sm text-ink-3 mb-8">
            Reference ID: {success.submissionId}
          </div>
          <a href="/" className="btn btn-primary">
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      {/* Header */}
      <header className="bg-panel shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center">
          <a
            href="/"
            className="inline-flex items-center text-ink-2 hover:text-ink transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 mr-2" />
            Back
          </a>
          <h1 className="ml-4 text-xl font-bold text-ink">Request a Quote</h1>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-panel rounded-lg shadow-lg p-6 md:p-8">
          <p className="text-ink-2 mb-8">
            Tell us about your event and we'll get back to you within 24-48
            hours with a customized proposal.
          </p>

          {error && (
            <div className="mb-6 p-4 bg-danger-soft border border-danger/40 rounded-lg">
              <p className="text-danger">{error}</p>
            </div>
          )}

          <form
            onSubmit={handleSubmit(submit)}
            {...formProps}
            className="space-y-6"
          >
            {/* Contact Information */}
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4">
                Contact Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="clientName"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Name *
                  </label>
                  <input
                    type="text"
                    id="clientName"
                    name="clientName"
                    required
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="Your full name"
                    disabled={busy}
                  />
                  <FieldError
                    name="clientName"
                    errors={errors}
                    touched={touched}
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="your@email.com"
                    disabled={busy}
                  />
                  <FieldError name="email" errors={errors} touched={touched} />
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="(555) 123-4567"
                    disabled={busy}
                  />
                </div>
              </div>
            </section>

            {/* Event Details */}
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4">
                Event Details
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="eventDate"
                      className="block text-sm font-medium text-ink-2 mb-1"
                    >
                      Event Date *
                    </label>
                    <input
                      type="date"
                      id="eventDate"
                      name="eventDate"
                      required
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                      disabled={busy}
                    />
                    <FieldError
                      name="eventDate"
                      errors={errors}
                      touched={touched}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="eventEndTime"
                      className="block text-sm font-medium text-ink-2 mb-1"
                    >
                      End Time
                    </label>
                    <input
                      type="time"
                      id="eventEndTime"
                      name="eventEndTime"
                      className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                      disabled={busy}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="guestCount"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Expected Guests *
                  </label>
                  <input
                    type="number"
                    id="guestCount"
                    name="guestCount"
                    required
                    min="1"
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="50"
                    disabled={busy}
                  />
                  <FieldError
                    name="guestCount"
                    errors={errors}
                    touched={touched}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="serviceStyleId"
                      className="block text-sm font-medium text-ink-2 mb-1"
                    >
                      Service Style
                    </label>
                    <select
                      id="serviceStyleId"
                      name="serviceStyleId"
                      className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                      disabled={busy}
                    >
                      <option value="">Select service style...</option>
                      {activeServiceStyles.map((style) => (
                        <option key={style._id} value={style._id}>
                          {style.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="occasionId"
                      className="block text-sm font-medium text-ink-2 mb-1"
                    >
                      Occasion
                    </label>
                    <select
                      id="occasionId"
                      name="occasionId"
                      className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                      disabled={busy}
                    >
                      <option value="">Select occasion...</option>
                      {activeOccasions.map((occasion) => (
                        <option key={occasion._id} value={occasion._id}>
                          {occasion.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* Venue Information */}
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4">
                Venue Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="venueName"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Venue Name
                  </label>
                  <input
                    type="text"
                    id="venueName"
                    name="venueName"
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="e.g., The Grand Ballroom"
                    disabled={busy}
                  />
                </div>

                <div>
                  <label
                    htmlFor="venueAddress"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Venue Address
                  </label>
                  <input
                    type="text"
                    id="venueAddress"
                    name="venueAddress"
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="123 Main St, City, State ZIP"
                    disabled={busy}
                  />
                </div>
              </div>
            </section>

            {/* Menu Preferences */}
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4">
                Menu Preferences
              </h2>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="menuPreferences"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Menu Preferences
                  </label>
                  <textarea
                    id="menuPreferences"
                    name="menuPreferences"
                    rows={3}
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="e.g., Plated dinner with beef and chicken options..."
                    disabled={busy}
                  />
                </div>

                <div>
                  <label
                    htmlFor="dietaryRestrictions"
                    className="block text-sm font-medium text-ink-2 mb-1"
                  >
                    Dietary Restrictions
                  </label>
                  <textarea
                    id="dietaryRestrictions"
                    name="dietaryRestrictions"
                    rows={2}
                    className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                    placeholder="e.g., Vegetarian, gluten-free, nut allergies..."
                    disabled={busy}
                  />
                </div>
              </div>
            </section>

            {/* Additional Notes */}
            <section>
              <h2 className="text-lg font-semibold text-ink mb-4">
                Additional Notes
              </h2>
              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-ink-2 mb-1"
                >
                  Any other details about your event?
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="w-full px-4 py-2 border border-line-2 rounded-lg focus:border-accent"
                  placeholder="Tell us about your vision, theme, special requests..."
                  disabled={busy}
                />
              </div>
            </section>

            {/* Consent */}
            <section className="border-t border-line pt-6">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="consent"
                  name="consent"
                  required
                  className="mt-1 h-4 w-4 text-ink border-line-2 rounded"
                  disabled={busy}
                />
                <label htmlFor="consent" className="ml-3 text-sm text-ink-2">
                  I consent to the processing of my personal data for the
                  purpose of preparing a quote for my event. I understand my
                  data will be handled according to the privacy policy.
                </label>
              </div>
              <FieldError name="consent" errors={errors} touched={touched} />
            </section>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary w-full justify-center"
              >
                {busy ? "Submitting..." : "Submit Quote Request"}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-4 py-8 text-center text-sm text-ink-3">
        <p>Questions? Contact us at info@catering-example.com</p>
      </footer>
    </div>
  );
}
