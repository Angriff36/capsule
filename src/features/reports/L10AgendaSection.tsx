import { EosPanel } from "../eos/EosShared";

/**
 * The weekly meeting's running order and ground rules, as written in the
 * owner's L10 meeting sheet (60 minutes, eight parts). The sections below
 * this one on the L10 page follow the same order.
 */

export const AGENDA: ReadonlyArray<{
  minutes: number;
  name: string;
  what: string;
  /** The section of the L10 page that holds this part. */
  anchor: string;
  /** Its EOS component colour (src/features/eos/eos.css). */
  tone: string;
}> = [
  {
    minutes: 5,
    name: "Good news",
    what: "One personal and one work win per person. Sets the tone.",
    anchor: "wins",
    tone: "data",
  },
  {
    minutes: 10,
    name: "Scorecard",
    what: "Weekly numbers. Only talk about the ones off track; move anything that needs work to Issues.",
    anchor: "l10-scorecard",
    tone: "data",
  },
  {
    minutes: 5,
    name: "Priorities",
    what: "Each 90-day priority: on track, at risk or off track. Quick status; save problems for Issues.",
    anchor: "rocks",
    tone: "traction",
  },
  {
    minutes: 5,
    name: "Client headlines",
    what: "Wins and complaints from the past week. Quick hits only.",
    anchor: "client-headlines",
    tone: "people",
  },
  {
    minutes: 5,
    name: "People headlines",
    what: "Hiring, recognition, concerns. Keep it in the room.",
    anchor: "people-headlines",
    tone: "people",
  },
  {
    minutes: 25,
    name: "Issues",
    what: "One at a time: name the real problem, talk it through, agree the answer.",
    anchor: "issues",
    tone: "issues",
  },
  {
    minutes: 5,
    name: "To-dos",
    what: "Who does what by when.",
    anchor: "todos",
    tone: "vision",
  },
  {
    minutes: 5,
    name: "Rate the meeting",
    what: "1 to 10. What went well, what would make it better.",
    anchor: "rating",
    tone: "traction",
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
    <div className="mt-5">
      <EosPanel
        tone="traction"
        eyebrow="Traction"
        title="Agenda · 60 minutes"
        lead="Same day, same time, same agenda. Click a part to jump to it."
      >
        <ol className="eos-agenda" data-testid="l10-agenda">
          {AGENDA.map((part, index) => (
            <li key={part.name} className={`eos-tone-${part.tone}`}>
              <a href={`#${part.anchor}`}>
                <span className="eos-agenda-min">{part.minutes} min</span>
                <strong>
                  {index + 1}. {part.name}
                </strong>
                <span className="eos-agenda-what">{part.what}</span>
              </a>
            </li>
          ))}
        </ol>
        <details className="mt-3 rounded-sm border border-line bg-inset px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Meeting rules
          </summary>
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">
            {RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      </EosPanel>
    </div>
  );
}
