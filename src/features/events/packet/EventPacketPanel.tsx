import { useState } from "react";
import type { Id } from "../../../lib/api";
import {
  useEventPacket,
  useEventPacketAccess,
  type PacketDecision,
} from "../../../lib/eventPacket/useEventPacket";
import { importSources } from "../../../lib/eventPacket/importSources";
import {
  parsePacketSnapshot,
  parsePortablePacket,
} from "../../../lib/eventPacket/packetContract";
import type {
  EventPacketSnapshot,
  PacketIssue,
} from "../../../lib/eventPacket/model";
import {
  canMarkNotApplicable,
  requirements,
} from "../../../lib/eventPacket/requirements";
import { readiness, fieldLabel } from "../../../lib/eventPacket/reconcile";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";

function valueText(value: unknown) {
  return Array.isArray(value)
    ? value.join(", ")
    : String(value ?? "Not recorded");
}
function openBlank() {
  const target = window.open("about:blank", "_blank");
  if (target) target.opener = null;
  return target;
}
function openLink(
  url: string | null | undefined,
  target: Window | null = null,
) {
  if (url) {
    if (target) target.location.href = url;
    else window.location.assign(url);
  } else
    throw new Error(
      "This source file is not attached. Import its original file to inspect it.",
    );
}

export function EventPacketPanel({ eventId }: { eventId: Id<"events"> }) {
  const canManage = useEventPacketAccess(eventId);
  if (canManage !== true) return null;
  return <ManagerPacketPanel eventId={eventId} />;
}
function ManagerPacketPanel({ eventId }: { eventId: Id<"events"> }) {
  const packet = useEventPacket(eventId);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [section, setSection] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };
  const view = packet.view;
  if (!view)
    return (
      <section aria-label="Event workbook" aria-busy="true">
        <p role="status">Loading event workbook…</p>
      </section>
    );
  const snapshot = view.snapshot;
  const open = snapshot.issues.filter((i) => i.required && i.status === "open");
  const uploadAndImport = async () => {
    if (!files.length) return;
    // A declared zone prevents turning source wall-clock times into an invented instant.
    new Intl.DateTimeFormat("en", { timeZone }).format();
    let imported: EventPacketSnapshot;
    let blobs: { fingerprint: string; bytes: Uint8Array }[] = [];
    if (files.length === 1 && files[0].name.toLowerCase().endsWith(".json")) {
      const json = JSON.parse(await files[0].text());
      if (json.format === "event-packet-portable") {
        const result = await parsePortablePacket(json);
        imported = result.snapshot;
        blobs = result.artifacts;
      } else {
        parsePacketSnapshot(json);
        throw new Error(
          "This snapshot contains references only. Select its portable packet export or original source files so Capsule can retain the evidence.",
        );
      }
    } else {
      const result = await importSources(
        await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            mimeType:
              file.type ||
              (file.name.endsWith(".csv") ? "text/csv" : "application/pdf"),
            bytes: new Uint8Array(await file.arrayBuffer()),
          })),
        ),
        {
          tenantId: snapshot.identity.tenantId,
          importedAt: new Date().toISOString(),
          existingArtifacts: snapshot.artifacts,
        },
      );
      const firstImport = snapshot.artifacts.length === 0;
      const matches = result.candidates.filter(
        (candidate) =>
          (firstImport ||
            candidate.identity.invoiceNumber ===
              snapshot.identity.invoiceNumber) &&
          candidate.identity.eventDate === snapshot.identity.eventDate,
      );
      if (matches.length !== 1)
        throw new Error(
          "These files do not identify this event unambiguously. Review their invoice number and event date, then select this event’s sources.",
        );
      const candidate = matches[0];
      const included = [...candidate.sources, ...result.sharedReferences];
      const keys = new Set(
        included.map((source) => source.artifact.fingerprint),
      );
      imported = {
        schemaVersion: 1,
        identity: { ...candidate.identity, eventId },
        artifacts: included.map((source) => source.artifact),
        observations: candidate.observations,
        facts: [],
        issues: [],
        resolutions: [],
        checklistVerifications: [],
        revisions: [],
        stage: "review",
      };
      blobs = result.artifactBytes
        .filter((blob) => keys.has(blob.artifact.fingerprint))
        .map((blob) => ({
          fingerprint: blob.artifact.fingerprint,
          bytes: blob.bytes,
        }));
      if (result.ungrouped.length)
        setNotice(
          `${result.ungrouped.length} unrelated or ambiguous source(s) were not attached: ${result.ungrouped.map((source) => source.artifact.name).join(", ")}.`,
        );
    }
    const attached = [];
    for (const blob of blobs) {
      const artifact = imported.artifacts.find(
        (a) => a.fingerprint === blob.fingerprint,
      )!;
      const stored = await packet.upload({
        ...blob,
        name: artifact.name,
        mimeType: artifact.mimeType,
        purpose: "source",
      });
      attached.push({
        fingerprint: blob.fingerprint,
        storageId: stored.storageId,
      });
    }
    await packet.importEvidence(imported, attached, timeZone);
    setFiles([]);
  };
  const prepare = () => {
    const target = openBlank();
    void run(async () => {
      try {
        await uploadAndImport();
        const result = await packet.prepare();
        const urls = await packet.revisionUrl(result.revisionId);
        openLink(urls.pdfUrl, target);
        setNotice(
          `${result.reused ? "Current workbook opened" : "Workbook prepared"}. Open questions remain visible on the cover and affected pages. The matching snapshot is available below.`,
        );
      } catch (error) {
        target?.close();
        throw error;
      }
    });
  };
  return (
    <section
      className="border-t border-line pt-5"
      aria-label="Event workbook"
      data-testid="event-packet-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="section-rule">
            <span>Event workbook</span>
            <i aria-hidden="true" />
            <em>
              {readiness(snapshot) ? "READY" : "NEEDS ATTENTION"} ·{" "}
              {open.length} open items
            </em>
          </h3>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={prepare}>
          {busy ? "Preparing…" : "Prepare workbook"}
        </button>
      </div>
      {view.latestRevision?.stale && (
        <p className="mt-3 text-sm text-danger" role="status">
          The printed workbook is out of date. Event information or evidence has
          changed.
        </p>
      )}
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      {notice && (
        <p className="mt-3 text-sm text-ink-2" role="status">
          {notice}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Source files or packet export
          <input
            className="mt-1 block max-w-full"
            type="file"
            accept=".pdf,.csv,.json"
            multiple
            disabled={busy}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <label className="text-sm">
          Event time zone
          <input
            className="input mt-1 block"
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>
      <p className="mt-2 text-sm text-ink-3">
        Current Capsule records stay authoritative. Imported approvals require
        local review. Live TPP, Nowsta, rentals and document checks remain open
        until verified.
      </p>
      <button
        className="btn-link mt-3"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded
          ? "Hide review"
          : `Review ${open.length} open items and sources`}
      </button>
      {expanded && (
        <div className="mt-4">
          <label className="text-sm">
            Review section
            <select
              className="input ml-2"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              <option value="all">All sections</option>
              {Array.from(new Set(open.map((i) => i.section))).map((key) => (
                <option key={key} value={key}>
                  {key === "packlist"
                    ? "Pack list"
                    : key[0].toUpperCase() + key.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="attention-band mt-4">
            <p className="px-4 pt-4 text-sm font-semibold text-ink">
              Open decisions
            </p>
            <ul className="divide-y divide-line px-4 pb-4">
              {open
                .filter((i) => section === "all" || i.section === section)
                .map((issue) => (
                  <IssueRow
                    key={`${issue.id}:${issue.evidenceFingerprint}`}
                    issue={issue}
                    snapshot={snapshot}
                    targets={view.nativeTargets?.[issue.fieldKey] ?? []}
                    busy={busy}
                    onSave={(decision) =>
                      run(async () => {
                        await packet.resolve(decision);
                      })
                    }
                    onSource={(fingerprint) => {
                      const target = openBlank();
                      return run(async () => {
                        try {
                          openLink(await packet.sourceUrl(fingerprint), target);
                        } catch (error) {
                          target?.close();
                          throw error;
                        }
                      });
                    }}
                  />
                ))}
            </ul>
          </div>
          <details className="mt-4">
            <summary>Source evidence ({snapshot.artifacts.length})</summary>
            <ul>
              {snapshot.artifacts.map((artifact) => (
                <li key={artifact.fingerprint} className="py-2 text-sm">
                  <button
                    className="btn-link"
                    onClick={() => {
                      const target = openBlank();
                      void run(async () => {
                        try {
                          openLink(
                            await packet.sourceUrl(artifact.fingerprint),
                            target,
                          );
                        } catch (error) {
                          target?.close();
                          throw error;
                        }
                      });
                    }}
                  >
                    {artifact.name}
                  </button>{" "}
                  · {artifact.kind.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          </details>
          <details className="mt-4">
            <summary>Workbook history and snapshots</summary>
            <ul>
              {snapshot.revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="flex flex-wrap gap-3 py-2 text-sm"
                >
                  <span>
                    {new Date(revision.createdAt).toLocaleString()} ·{" "}
                    {(revision.supersededBy &&
                      view.latestRevision?.id !== revision.id) ||
                    (view.latestRevision?.id === revision.id &&
                      view.latestRevision.stale)
                      ? "Superseded / out of date"
                      : "Recorded revision"}
                  </span>
                  <button
                    className="btn-link"
                    onClick={() => {
                      const target = openBlank();
                      void run(async () => {
                        try {
                          openLink(
                            (await packet.revisionUrl(revision.id)).pdfUrl,
                            target,
                          );
                        } catch (error) {
                          target?.close();
                          throw error;
                        }
                      });
                    }}
                  >
                    PDF
                  </button>
                  <button
                    className="btn-link"
                    onClick={() => {
                      const target = openBlank();
                      void run(async () => {
                        try {
                          openLink(
                            (await packet.revisionUrl(revision.id)).snapshotUrl,
                            target,
                          );
                        } catch (error) {
                          target?.close();
                          throw error;
                        }
                      });
                    }}
                  >
                    Snapshot
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}

function IssueRow({
  issue,
  snapshot,
  targets,
  busy,
  onSave,
  onSource,
}: {
  issue: PacketIssue;
  snapshot: EventPacketSnapshot;
  targets: { id: string; label: string }[];
  busy: boolean;
  onSave(decision: PacketDecision): Promise<void>;
  onSource(fingerprint: string): Promise<void>;
}) {
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [entry, setEntry] = useState("");
  const [target, setTarget] = useState("");
  const [signed, setSigned] = useState(false);
  const requirement = requirements.find((r) => r.key === issue.key);
  const observations = snapshot.observations.filter(
    (o) => o.fieldKey === issue.fieldKey,
  );
  const native = snapshot.facts.find(
    (f) => f.fieldKey === issue.fieldKey && f.authority === "native_finalized",
  );
  const signature = /signature|signoff/.test(issue.key);
  return (
    <li className="py-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          {issue.message}
        </summary>
        <p className="mt-2 text-sm text-ink-2">Owner: {issue.owner}</p>
        {native && (
          <p className="mt-2 text-sm">
            Current Capsule value:{" "}
            <strong>
              {valueText(native.value)} {native.unit}
            </strong>
          </p>
        )}
        <ul className="my-2 text-sm">
          {issue.evidence.map((e, index) => (
            <li key={index}>
              <button
                className="btn-link"
                onClick={() => void onSource(e.artifactFingerprint)}
              >
                {snapshot.artifacts.find(
                  (a) => a.fingerprint === e.artifactFingerprint,
                )?.name ?? "Source"}
              </button>
              {e.page ? ` · page ${e.page}` : ""}
              {e.row ? ` · row ${e.row}` : ""}
              {e.cell ? ` · cell ${e.cell}` : ""}
            </li>
          ))}
        </ul>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const observed = observations.find((o) => o.id === choice);
            const answer = requirement
              ? (choice as "yes" | "no" | "not_applicable")
              : undefined;
            const value = requirement
              ? choice
              : choice === "native"
                ? native?.value
                : (observed?.value ??
                  (issue.fieldKey === "guestCount" ? Number(entry) : entry));
            if (value === undefined) return;
            void onSave({
              issueId: issue.id,
              evidenceFingerprint: issue.evidenceFingerprint,
              choice: value,
              reason,
              ...(answer
                ? { answer, kind: "verification" as const }
                : observed
                  ? {
                      observationId: observed.id,
                      unit: observed.unit,
                      kind: "fact_choice" as const,
                    }
                  : { kind: "fact_entry" as const, unit: native?.unit }),
              ...(target ? { nativeTargetId: target } : {}),
            });
          }}
        >
          <label className="block text-sm">
            {requirement ? "Verification" : fieldLabel(issue.fieldKey)}
            <select
              className="input mt-1 block w-full"
              required
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">Choose a decision</option>
              {requirement ? (
                <>
                  <option value="yes">Yes — verified</option>
                  <option value="no">No — still open</option>
                  {requirement &&
                    canMarkNotApplicable(requirement, snapshot) && (
                      <option value="not_applicable">
                        Not applicable — explain why
                      </option>
                    )}
                </>
              ) : (
                <>
                  {native && (
                    <option value="native">Keep current Capsule value</option>
                  )}
                  {observations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {valueText(o.value)} {o.unit} — source evidence
                    </option>
                  ))}
                  <option value="entry">Enter confirmed value</option>
                </>
              )}
            </select>
          </label>
          {choice === "entry" && (
            <label className="block text-sm">
              Confirmed value
              <input
                className="input mt-1 block w-full"
                required
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                type={issue.fieldKey === "guestCount" ? "number" : "text"}
              />
            </label>
          )}
          {targets.length > 0 && (
            <label className="block text-sm">
              Update native record
              <select
                className="input mt-1 block w-full"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Select if changing the current value</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Decision and evidence
            <textarea
              className="input mt-1 block min-h-20 w-full"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What you checked and why this is correct"
            />
          </label>
          {signature && choice === "yes" && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={signed}
                onChange={(e) => setSigned(e.target.checked)}
                required
              />
              I personally confirm this sign-off under my signed-in name.
            </label>
          )}
          <button
            className="btn btn-secondary"
            disabled={
              busy ||
              !choice ||
              !reason.trim() ||
              (signature && choice === "yes" && !signed)
            }
          >
            Record decision
          </button>
        </form>
      </details>
    </li>
  );
}
