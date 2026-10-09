import { Section } from "@/ui/primitives";

/**
 * The weekly meeting's running order and ground rules, as written in the
 * owner's L10 meeting sheet (60 minutes, eight parts). The sections below
 * this one on the L10 page follow the same order.
 */

const AGENDA: ReadonlyArray<{ minutes: number; name: string; what: string }> = [
  {
    minutes: 5,
    name: "Good news",
    what: "One personal and one work win per person. Sets the tone.",
  },
  {
    minutes: 10,
    name: "Scorecard",
    what: "Weekly numbers. Only talk about the ones off track; move anything that needs work to Issues.",
  },
  {
    minutes: 5,
    name: "Priorities",
    what: "Each 90-day priority: on track, at risk or off track. Quick status; save problems for Issues.",
  },
  {
    minutes: 5,
    name: "Client headlines",
    what: "Wins and complaints from the past week. Quick hits only.",
  },
  {
    minutes: 5,
    name: "People headlines",
    what: "Hiring, recognition, concerns. Keep it in the room.",
  },
  {
    minutes: 25,
    name: "Issues",
    what: "One at a time: name the real problem, talk it through, agree the answer.",
  },
  {
    minutes: 5,
    name: "To-dos",
    what: "Who does what by when.",
  },
  {
    minutes: 5,
    name: "Rate the meeting",
    what: "1 to 10. What went well, what would make it better.",
  },
];

const RULES = [
  "Start on time, end on time: 60 minutes, hard stop.",
  "Phones away.",
  "Name the problem before you talk it through, and talk it through before you solve it.",
  "One issue at a time.",
  "Every to-do has an owner. No owner, no to-do.",
  "What is said in the meeting stays in the meeting, most of all people headlines.",
];

export function L10AgendaSection() {
  return (
    <div className="mt-6">
      <Section title="Agenda (60 minutes)">
        <ol className="grid gap-2 p-4 pb-0" data-testid="l10-agenda">
          {AGENDA.map((part, index) => (
            <li key={part.name} className="flex gap-3 text-sm">
              <span className="w-14 shrink-0 font-semibold text-brand">
                {part.minutes} min
              </span>
              <span>
                <span className="font-semibold text-ink">
                  {index + 1}. {part.name}
                </span>
                <span className="block text-xs text-ink-2">{part.what}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="m-4 rounded-sm border border-line bg-inset p-3">
          <h4 className="text-xs font-semibold text-ink">Meeting rules</h4>
          <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  );
}
