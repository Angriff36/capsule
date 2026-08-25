import type { Id } from "../../lib/api";
import { list, optional } from "./eventDetailFormHelpers";
import { EventFormCluster } from "./EventFormCluster";

type Props = {
  readonly eventId: Id<"events">;
  readonly version: number | undefined;
  readonly busy: boolean;
  readonly canRevise: boolean;
  readonly reviseBlockedReason: string | undefined;
  readonly primaryContactName?: string | null;
  readonly primaryContactEmail?: string | null;
  readonly primaryContactPhone?: string | null;
  readonly accessibilityNeeds?: string[] | null;
  readonly serviceRequirements?: string | null;
  readonly operationalRequirements?: string | null;
  readonly run: (work: () => Promise<unknown>) => Promise<void>;
  readonly onChangePrimaryContact: (input: {
    docId: Id<"events">;
    primaryContactName: string;
    primaryContactEmail?: string;
    primaryContactPhone?: string;
    version: number | undefined;
  }) => Promise<unknown>;
  readonly onChangeRequirements: (input: {
    docId: Id<"events">;
    accessibilityNeeds?: string[];
    serviceRequirements?: string;
    operationalRequirements?: string;
    version: number | undefined;
  }) => Promise<unknown>;
};

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

/** Contact + planning-requirements form tiles for Event Overview. */
export function EventDetailReviseContactPanels({
  eventId,
  version,
  busy,
  canRevise,
  reviseBlockedReason,
  primaryContactName,
  primaryContactEmail,
  primaryContactPhone,
  accessibilityNeeds,
  serviceRequirements,
  operationalRequirements,
  run,
  onChangePrimaryContact,
  onChangeRequirements,
}: Props) {
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <EventFormCluster title="Primary contact" hint="Who we call on the day">
        <form
          key={`contact-${version}`}
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const data = new FormData(formEvent.currentTarget);
            void run(() =>
              onChangePrimaryContact({
                docId: eventId,
                primaryContactName: formText(data, "name").trim(),
                primaryContactEmail: optional(formText(data, "email")),
                primaryContactPhone: optional(formText(data, "phone")),
                version,
              }),
            );
          }}
        >
          <label className="field-label">
            <span>Name</span>
            <input
              name="name"
              defaultValue={primaryContactName ?? ""}
              className="input"
              disabled={!canRevise}
              title={reviseBlockedReason}
              required
            />
          </label>
          <label className="field-label">
            <span>Email</span>
            <input
              name="email"
              type="email"
              defaultValue={primaryContactEmail ?? ""}
              className="input"
              disabled={!canRevise}
              title={reviseBlockedReason}
            />
          </label>
          <label className="field-label">
            <span>Phone</span>
            <input
              name="phone"
              defaultValue={primaryContactPhone ?? ""}
              className="input"
              disabled={!canRevise}
              title={reviseBlockedReason}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary min-h-10 sm:col-span-3 sm:justify-self-start"
            disabled={!canRevise || busy}
            title={reviseBlockedReason}
          >
            Save contact
          </button>
        </form>
      </EventFormCluster>

      <EventFormCluster
        title="Planning requirements"
        hint="Accessibility, service, and ops notes"
      >
        <form
          key={`requirements-${version}`}
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            const data = new FormData(formEvent.currentTarget);
            void run(() =>
              onChangeRequirements({
                docId: eventId,
                accessibilityNeeds: list(formText(data, "accessibility")),
                serviceRequirements: optional(formText(data, "service")),
                operationalRequirements: optional(formText(data, "operations")),
                version,
              }),
            );
          }}
        >
          <label className="field-label sm:col-span-2">
            <span>Accessibility</span>
            <input
              name="accessibility"
              defaultValue={(accessibilityNeeds ?? []).join(", ")}
              className="input"
              disabled={!canRevise}
              title={reviseBlockedReason}
            />
          </label>
          <label className="field-label">
            <span>Service</span>
            <textarea
              name="service"
              defaultValue={serviceRequirements ?? ""}
              className="input min-h-20 py-2"
              disabled={!canRevise}
              title={reviseBlockedReason}
            />
          </label>
          <label className="field-label">
            <span>Operations</span>
            <textarea
              name="operations"
              defaultValue={operationalRequirements ?? ""}
              className="input min-h-20 py-2"
              disabled={!canRevise}
              title={reviseBlockedReason}
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary min-h-10 sm:col-span-2 sm:justify-self-start"
            disabled={!canRevise || busy}
            title={reviseBlockedReason}
          >
            Save requirements
          </button>
        </form>
      </EventFormCluster>
    </div>
  );
}
