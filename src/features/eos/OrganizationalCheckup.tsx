import { useState } from "react";
import {
  useCreateOrganizationalCheckup,
  useListOrganizationalCheckup,
} from "@/lib/manifest-convex-react";
import { formatDate } from "@/lib/format";
import { EosPanel, ProgressBar, ScoreRing, useRun } from "./EosShared";
import {
  CHECKUP_STATEMENTS,
  EOS_COMPONENTS,
  checkupByComponent,
  checkupScore,
  personName,
} from "./eosModel";
import { useActivePeople, useEosViewer } from "./useEosData";

const SCALE = [1, 2, 3, 4, 5] as const;

/**
 * The Organizational Checkup: twenty statements scored 1 (weak) to 5
 * (strong), so the score is a percent. The book's mark to aim for is 80.
 * The last result shows as a dial with a bar for each component.
 */
export function OrganizationalCheckup() {
  const checkups = useListOrganizationalCheckup();
  const people = useActivePeople();
  const { canEdit } = useEosViewer();
  const take = useCreateOrganizationalCheckup();
  const { run, busy, banner } = useRun();
  const [answers, setAnswers] = useState<(number | null)[] | null>(null);

  if (!canEdit) return null;

  const taken = (checkups ?? [])
    .filter((row) => row.takenAt != null)
    .sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0));
  const latest = taken[0];
  const byComponent = latest ? checkupByComponent(latest.answers) : null;
  const answered = answers?.filter((value) => value != null).length ?? 0;

  const submit = () => {
    if (!answers || answers.some((value) => value == null)) return;
    const values = answers as number[];
    void run(() =>
      take({ answers: values.join(""), score: checkupScore(values) }),
    ).then((ok) => {
      if (ok) setAnswers(null);
    });
  };

  return (
    <EosPanel
      tone="traction"
      id="checkup"
      eyebrow="How strong is Mangia?"
      title="Organizational Checkup"
      lead={
        latest
          ? `Last taken ${formatDate(latest.takenAt!)} by ${personName(people, latest.takenByPersonId, "a manager")}. EOS aims for 80 or more.`
          : "Twenty statements, about five minutes. Score each one 1 (weak) to 5 (strong)."
      }
      actions={
        answers ? null : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAnswers(CHECKUP_STATEMENTS.map(() => null))}
          >
            {latest ? "Take it again" : "Take the checkup"}
          </button>
        )
      }
    >
      {banner}
      {answers ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ProgressBar
                value={(answered / CHECKUP_STATEMENTS.length) * 100}
                label="Statements answered"
              />
            </div>
            <span className="font-mono text-sm text-ink-2">
              {answered} of {CHECKUP_STATEMENTS.length}
            </span>
          </div>
          {EOS_COMPONENTS.map((component) => (
            <div
              key={component.key}
              className={`eos-tone-${component.key} grid gap-1.5`}
            >
              <span className="eos-eyebrow mt-2">{component.name}</span>
              {CHECKUP_STATEMENTS.map((statement, index) =>
                statement.component === component.key ? (
                  <div key={index} className="eos-statement">
                    <p>
                      <span className="mr-2 font-mono text-ink-3">
                        {index + 1}.
                      </span>
                      {statement.text}
                    </p>
                    <div
                      className="eos-scale"
                      role="group"
                      aria-label={`Statement ${index + 1}`}
                    >
                      {SCALE.map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={answers[index] === value}
                          aria-label={`${value} of 5`}
                          onClick={() =>
                            setAnswers((current) =>
                              current
                                ? current.map((old, at) =>
                                    at === index ? value : old,
                                  )
                                : current,
                            )
                          }
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || answered < CHECKUP_STATEMENTS.length}
              onClick={submit}
            >
              Save score{" "}
              {answered === CHECKUP_STATEMENTS.length
                ? `· ${checkupScore(answers as number[])}`
                : ""}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAnswers(null)}
            >
              Cancel
            </button>
            <span className="text-sm text-ink-3">
              1 weak · 3 sometimes · 5 strong
            </span>
          </div>
        </div>
      ) : latest && byComponent ? (
        <div className="eos-checkup-hero">
          <ScoreRing value={latest.score} caption="of 100" />
          <div className="grid gap-2">
            {EOS_COMPONENTS.map((component) => (
              <div
                key={component.key}
                className={`eos-tone-${component.key} grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-sm`}
              >
                <span className="font-semibold text-ink">{component.name}</span>
                <ProgressBar
                  value={byComponent[component.key]}
                  label={`${component.name} score`}
                />
                <span className="text-right font-mono text-ink-2">
                  {byComponent[component.key]}%
                </span>
              </div>
            ))}
            {taken.length > 1 ? (
              <p className="text-xs text-ink-3">
                Earlier:{" "}
                {taken
                  .slice(1, 6)
                  .map((row) => `${row.score} (${formatDate(row.takenAt!)})`)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-base text-ink-2">
          Take the checkup first: it shows which of the six components needs
          work, and taking it again each quarter shows the progress.
        </p>
      )}
    </EosPanel>
  );
}
