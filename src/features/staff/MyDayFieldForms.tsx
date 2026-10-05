import { useEffect, useState } from "react";
import { FieldFormCard } from "../events/packet/FieldFormCard";
import { useMyFieldForms } from "../../lib/eventPacket/useFieldForms";
import { EmptyState } from "../../ui/primitives";
import { MyDaySection as Section } from "./MyDayDashboard";

/**
 * The day-of forms on events this person works: what to check, when it is
 * due, and signing it as themselves with the time they did it.
 */
export function MyDayFieldForms({ personId }: { personId: string }) {
  const { forms, complete, countersign } = useMyFieldForms();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!forms) return null;
  const open = forms.filter((f) => f.status !== "done");
  return (
    <div id="my-day-field-forms" data-testid="my-day-field-forms">
      <Section title="Day-of forms" count={open.length}>
        {forms.length === 0 ? (
          <EmptyState
            title="No day-of forms"
            hint="Forms like leaving the shop, arrival and the return check show here for events you work."
          />
        ) : (
          <ul className="divide-y divide-line">
            {forms.map((form) => (
              <FieldFormCard
                key={form.id}
                form={form}
                now={now}
                heading={`${form.label} · ${form.eventTitle}`}
                myPersonId={personId}
                onComplete={complete}
                onCountersign={countersign}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
