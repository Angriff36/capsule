import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePeopleAnalyzerScore,
  useListAccountabilitySeat,
  useListPeopleAnalyzerScore,
  usePeopleAnalyzerScoreRescore,
  usePeopleAnalyzerScoreWithdraw,
} from "@/lib/manifest-convex-react";
import { StatusChip } from "@/ui/primitives";
import type { Doc } from "../../lib/api";
import { EosPanel, useRun } from "./EosShared";
import {
  EOS_PATHS,
  GWC,
  PEOPLE_SCORE_CYCLE,
  PEOPLE_SCORE_LABEL,
  peopleVerdict,
  type PeopleScore,
} from "./eosModel";
import {
  useActivePeople,
  useCompanyVision,
  useEosViewer,
  useSaveVision,
  useVisionItems,
} from "./useEosData";

type Score = Doc<"peopleAnalyzerScores">;

const VERDICT = {
  above: { label: "Right person, right seat", tone: "chip-tone-ok" },
  below: { label: "Below the bar", tone: "chip-tone-danger" },
  unrated: { label: "Not finished", tone: "chip-tone-mute" },
} as const;

/**
 * The People Analyzer: each person against every core value (+, +/−, −) and
 * the three seat questions (Gets it, Wants it, Capacity to do it). Click a
 * mark to step it; the last column says if the person is above the bar.
 */
export function PeopleAnalyzer() {
  const people = useActivePeople();
  const seats = useListAccountabilitySeat();
  const scores = useListPeopleAnalyzerScore();
  const items = useVisionItems();
  const vision = useCompanyVision();
  const saveVision = useSaveVision(vision);
  const { canEdit } = useEosViewer();
  const rate = useCreatePeopleAnalyzerScore();
  const rescore = usePeopleAnalyzerScoreRescore();
  const withdraw = usePeopleAnalyzerScoreWithdraw();
  const { run, busy, banner } = useRun();
  const [everyone, setEveryone] = useState(false);

  if (!canEdit) return null;

  const values = (items ?? [])
    .filter((row) => row.section === "core_value")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const maxMixed = vision?.peopleBarMaxMixed ?? 1;
  const seatOf = new Map<string, string>();
  for (const seat of seats ?? [])
    if (seat.personId && seat.placedAt != null)
      seatOf.set(
        String(seat.personId),
        [seatOf.get(String(seat.personId)), seat.title]
          .filter(Boolean)
          .join(", "),
      );
  const rows = people.filter((person) => everyone || seatOf.has(person._id));

  const byPerson = new Map<string, Map<string, Score>>();
  for (const score of scores ?? []) {
    const map = byPerson.get(String(score.personId)) ?? new Map();
    map.set(score.subject, score);
    byPerson.set(String(score.personId), map);
  }

  const step = (personId: string, subject: string, current?: Score) => {
    const index = PEOPLE_SCORE_CYCLE.indexOf(current?.score ?? null);
    const next = PEOPLE_SCORE_CYCLE[(index + 1) % PEOPLE_SCORE_CYCLE.length];
    // Seat questions are yes or no: + then − then empty.
    const isSeatQuestion = GWC.some((entry) => entry.key === subject);
    const target: PeopleScore | null =
      isSeatQuestion && next === "plus_minus" ? "minus" : next;
    void run(() => {
      if (!current) return rate({ personId, subject, score: target! });
      if (target === null)
        return withdraw({ docId: current._id, version: current.version });
      return rescore({
        docId: current._id,
        version: current.version,
        score: target,
      });
    });
  };

  return (
    <EosPanel
      tone="people"
      id="analyzer"
      eyebrow="People"
      title="People Analyzer"
      lead="Click a mark to change it: + always, +/− sometimes, − rarely. Seat questions are yes (+) or no (−)."
      actions={
        <>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Bar: at most
            <select
              className="input"
              value={maxMixed}
              disabled={busy}
              onChange={(event) =>
                void run(() =>
                  saveVision({ peopleBarMaxMixed: Number(event.target.value) }),
                )
              }
            >
              {[0, 1, 2, 3].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            +/−, no −
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={everyone}
              onChange={(event) => setEveryone(event.target.checked)}
            />
            Everyone, not just seats
          </label>
        </>
      }
    >
      {banner}
      {values.length === 0 ? (
        <p className="mb-3 rounded-sm bg-warn-soft px-3 py-2 text-sm text-warn">
          Write Mangia's core values on the{" "}
          <Link to={EOS_PATHS.vision} className="btn-link">
            V/TO
          </Link>{" "}
          first; each one becomes a column here.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">
          {seats && seats.length > 0
            ? "No one sits in a seat yet. Put people in seats on the chart above, or tick “Everyone”."
            : "Build the Accountability Chart above, or tick “Everyone”."}
        </p>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table eos-analyzer">
            <thead>
              <tr>
                <th>Person</th>
                {values.map((value) => (
                  <th
                    key={value._id}
                    className="eos-rot"
                    title={value.detail ?? undefined}
                  >
                    {value.text}
                  </th>
                ))}
                {GWC.map((entry) => (
                  <th key={entry.key} className="eos-rot">
                    {entry.label}
                  </th>
                ))}
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => {
                const marks =
                  byPerson.get(person._id) ?? new Map<string, Score>();
                const verdict = peopleVerdict(
                  new Map([...marks].map(([key, row]) => [key, row.score])),
                  values.map((value) => String(value._id)),
                  maxMixed,
                );
                const name = `${person.givenName} ${person.familyName}`.trim();
                return (
                  <tr key={person._id}>
                    <td>
                      <span className="font-semibold text-ink">{name}</span>
                      <span className="block text-xs text-ink-3">
                        {seatOf.get(person._id) ?? "No seat"}
                      </span>
                    </td>
                    {[
                      ...values.map((value) => String(value._id)),
                      ...GWC.map((entry) => entry.key),
                    ].map((subject) => {
                      const current = marks.get(subject);
                      return (
                        <td key={subject} className="text-center">
                          <button
                            type="button"
                            className="eos-mark"
                            data-score={current?.score}
                            disabled={busy}
                            aria-label={`${name}, ${
                              values.find(
                                (value) => String(value._id) === subject,
                              )?.text ??
                              GWC.find((entry) => entry.key === subject)?.label
                            }: ${current ? PEOPLE_SCORE_LABEL[current.score] : "not marked"}`}
                            onClick={() => step(person._id, subject, current)}
                          >
                            {current ? PEOPLE_SCORE_LABEL[current.score] : "·"}
                          </button>
                        </td>
                      );
                    })}
                    <td>
                      <StatusChip
                        status={verdict}
                        color={VERDICT[verdict].tone}
                        label={VERDICT[verdict].label}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </EosPanel>
  );
}
