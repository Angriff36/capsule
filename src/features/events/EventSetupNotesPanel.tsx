import { useEffect, useRef, useState } from "react";
import type { Id } from "../../lib/api";
import {
  useEventUpdateSetupNotes,
  useEventUpdateTaskBreakdown,
  useGetEvent,
} from "../../lib/manifest-convex-react";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

type Props = {
  readonly eventId: Id<"events">;
};

type SheetField = {
  readonly key: string;
  readonly label: string;
  readonly placeholder: string;
};

type SheetValues = Record<string, string>;

/**
 * Ops Final Lock setup notes and the Event Task Breakdown lines. Both are
 * free text, both save the whole section at once (an empty box clears the
 * saved answer), and both sit beside the battle board day sheet because the
 * same person fills them in at the same moment.
 */
const SETUP_FIELDS: readonly SheetField[] = [
  {
    key: "linenColorTables",
    label: "Linen color — tables",
    placeholder: "Ivory",
  },
  {
    key: "linenColorBaskets",
    label: "Linen color — baskets",
    placeholder: "Black",
  },
  {
    key: "servingwareKit",
    label: "Servingware kit",
    placeholder: "Stainless chafers, 2 sets",
  },
  { key: "decorKit", label: "Decor kit", placeholder: "Lanterns and greenery" },
  { key: "rainPlan", label: "Rain plan", placeholder: "Move service indoors" },
  {
    key: "setupDiagram",
    label: "Setup diagram",
    placeholder: "Binder page 3",
  },
];

const TASK_FIELDS: readonly SheetField[] = [
  {
    key: "servingwareSource",
    label: "Servingware source",
    placeholder: "Plasticware / Rented / Client provided",
  },
  {
    key: "takeRentalsWithUs",
    label: "Take rentals with us",
    placeholder: "Yes",
  },
  {
    key: "leaveRentalsOnsite",
    label: "Leave rentals onsite",
    placeholder: "No",
  },
  {
    key: "guestTableSetup",
    label: "Guest table setup",
    placeholder: "Client sets the guest tables",
  },
  {
    key: "buffetTableSetup",
    label: "Buffet table setup",
    placeholder: "Two 8 ft tables, we set them",
  },
  {
    key: "appetizerTableSetup",
    label: "Appetizer table setup",
    placeholder: "One 6 ft table near the bar",
  },
  {
    key: "beverageTableSetup",
    label: "Beverage table setup",
    placeholder: "Client provides the table",
  },
  {
    key: "beverageDispensers",
    label: "Beverage dispensers",
    placeholder: "Two 3 gal dispensers",
  },
  {
    key: "buffetService",
    label: "Buffet service",
    placeholder: "Serve / Self-serve",
  },
];

function EventSheetSection({
  identity,
  title,
  description,
  testId,
  fields,
  initial,
  onSave,
}: {
  readonly identity: string;
  readonly title: string;
  readonly description: string;
  readonly testId: string;
  readonly fields: readonly SheetField[];
  readonly initial: SheetValues | null;
  readonly onSave: (next: SheetValues) => Promise<void>;
}) {
  const [form, setForm] = useState<SheetValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const latest = useRef(initial);
  latest.current = initial;
  // What the server holds. A blur saves only when the box differs from this:
  // the form state already has the typed text, so it cannot be the baseline.
  const saved = useRef<SheetValues | null>(null);
  const ready = initial != null;

  // Seed once the event has loaded and again when the page changes event;
  // reactive bumps must not overwrite what the user is typing.
  useEffect(() => {
    if (latest.current) {
      setForm(latest.current);
      saved.current = latest.current;
    }
  }, [identity, ready]);

  const persist = async (next: SheetValues) => {
    setBusy(true);
    setFailure(null);
    try {
      await onSave(next);
      saved.current = next;
      setSavedAt(Date.now());
    } catch (cause) {
      setFailure(classifyCommandFailure(cause));
    } finally {
      setBusy(false);
    }
  };

  const commit = (key: string, value: string) => {
    if (!form) return;
    if ((saved.current?.[key] ?? "") === value) return;
    const next = { ...form, [key]: value };
    setForm(next);
    void persist(next);
  };

  const type = (key: string, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  if (!form) {
    return (
      <section className="card p-5" aria-label={title}>
        <p className="text-sm text-ink-3">Loading {title.toLowerCase()}…</p>
      </section>
    );
  }

  return (
    <section className="card p-5" aria-label={title} data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-sm text-ink-2">{description}</p>
        </div>
        <span className="text-sm text-ink-3" aria-live="polite">
          {busy ? "Saving…" : savedAt != null ? "Saved" : ""}
        </span>
      </div>

      {failure ? <FailureBanner failure={failure} /> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {fields.map((field) => (
          <label key={field.key} className="field-label block">
            <span>{field.label}</span>
            <input
              className="input"
              value={form[field.key] ?? ""}
              disabled={busy}
              placeholder={field.placeholder}
              onChange={(changeEvent) =>
                type(field.key, changeEvent.target.value)
              }
              onBlur={(blurEvent) => commit(field.key, blurEvent.target.value)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

export function EventSetupNotesPanel({ eventId }: Props) {
  const event = useGetEvent(eventId);
  const save = useEventUpdateSetupNotes();
  const initial: SheetValues | null = event
    ? {
        linenColorTables: event.linenColorTables ?? "",
        linenColorBaskets: event.linenColorBaskets ?? "",
        servingwareKit: event.servingwareKit ?? "",
        decorKit: event.decorKit ?? "",
        rainPlan: event.rainPlan ?? "",
        setupDiagram: event.setupDiagram ?? "",
      }
    : null;

  return (
    <EventSheetSection
      identity={String(event?._id ?? "")}
      title="Setup notes"
      description="Linens, kits, the rain plan and the diagram the crew sets up from. An empty box clears the saved answer."
      testId="event-setup-notes-panel"
      fields={SETUP_FIELDS}
      initial={initial}
      onSave={async (next) => {
        if (!event) return;
        await save({
          docId: event._id,
          version:
            typeof event.version === "number" ? event.version : undefined,
          linenColorTables: next.linenColorTables,
          linenColorBaskets: next.linenColorBaskets,
          servingwareKit: next.servingwareKit,
          decorKit: next.decorKit,
          rainPlan: next.rainPlan,
          setupDiagram: next.setupDiagram,
        });
      }}
    />
  );
}

export function EventTaskBreakdownPanel({ eventId }: Props) {
  const event = useGetEvent(eventId);
  const save = useEventUpdateTaskBreakdown();
  const initial: SheetValues | null = event
    ? {
        servingwareSource: event.servingwareSource ?? "",
        takeRentalsWithUs: event.takeRentalsWithUs ?? "",
        leaveRentalsOnsite: event.leaveRentalsOnsite ?? "",
        guestTableSetup: event.guestTableSetup ?? "",
        buffetTableSetup: event.buffetTableSetup ?? "",
        appetizerTableSetup: event.appetizerTableSetup ?? "",
        beverageTableSetup: event.beverageTableSetup ?? "",
        beverageDispensers: event.beverageDispensers ?? "",
        buffetService: event.buffetService ?? "",
      }
    : null;

  return (
    <EventSheetSection
      identity={String(event?._id ?? "")}
      title="Task breakdown"
      description="Who brings what and who sets which table. An empty box clears the saved answer."
      testId="event-task-breakdown-panel"
      fields={TASK_FIELDS}
      initial={initial}
      onSave={async (next) => {
        if (!event) return;
        await save({
          docId: event._id,
          version:
            typeof event.version === "number" ? event.version : undefined,
          servingwareSource: next.servingwareSource,
          takeRentalsWithUs: next.takeRentalsWithUs,
          leaveRentalsOnsite: next.leaveRentalsOnsite,
          guestTableSetup: next.guestTableSetup,
          buffetTableSetup: next.buffetTableSetup,
          appetizerTableSetup: next.appetizerTableSetup,
          beverageTableSetup: next.beverageTableSetup,
          beverageDispensers: next.beverageDispensers,
          buffetService: next.buffetService,
        });
      }}
    />
  );
}
