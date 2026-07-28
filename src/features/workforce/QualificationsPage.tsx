import { useState, type FormEvent } from "react";
import {
  useCreateQualification,
  useListPerson,
  useListQualification,
  useQualificationExpire,
  useQualificationRevoke,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatDate } from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceLifecyclePolicy } from "./WorkforceLifecyclePolicy";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

const policy = new WorkforceLifecyclePolicy();
const EXPIRY_ALERT_WINDOW_MS = 30 * 86_400_000;

const certificationTypes = [
  ["food_handler", "Food handler card"],
  ["alcohol_service", "Alcohol service permit"],
  ["drivers_license_class_c", "Driver's license — Class C"],
] as const;

function expiryLabel(expiresAt: number | undefined, now: number) {
  if (expiresAt == null) return null;
  if (expiresAt < now) {
    return { label: "Expired", className: "text-danger" };
  }
  if (expiresAt <= now + EXPIRY_ALERT_WINDOW_MS) {
    const days = Math.ceil((expiresAt - now) / 86_400_000);
    return {
      label: days <= 1 ? "Expires today" : `Expires in ${days} days`,
      className: "font-medium text-brand",
    };
  }
  return null;
}

export function QualificationsPage() {
  const qualifications = useListQualification();
  const people = useListPerson();
  const grant = useCreateQualification();
  const revoke = useQualificationRevoke();
  const expire = useQualificationExpire();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const activeRows = (qualifications ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const now = Date.now();
  const attentionCount = activeRows.filter(
    (row) =>
      row.status === "active" &&
      row.expiresAt != null &&
      row.expiresAt <= now + EXPIRY_ALERT_WINDOW_MS,
  ).length;
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitGrant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const expiresRaw = String(data.get("expiresAt") || "");
    void run("grant", async () => {
      await grant({
        personId: String(data.get("personId")),
        name: String(data.get("name")),
        // Date-only inputs parse as local midnight ("T00:00:00"), not UTC,
        // so the selected calendar day survives west-of-UTC time zones.
        issuedAt: new Date(
          `${String(data.get("issuedAt"))}T00:00:00`,
        ).getTime(),
        certificationType: String(data.get("certificationType")),
        issuingBody: String(data.get("issuingBody")),
        expiresAt: expiresRaw
          ? new Date(`${expiresRaw}T23:59:59.999`).getTime()
          : undefined,
        documentRef: String(data.get("documentRef") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setShowCreate(false);
    });
  };

  const invoke = (row: any, key: string) => {
    void run(`${row._id}:${key}`, async () => {
      const args = { docId: row._id, version: row.version };
      if (key === "revoke") await revoke(args);
      if (key === "expire") await expire(args);
    });
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Qualifications</p>
          <h1 className="display-title mt-2">Qualification ledger</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Record professional certifications by person, issuer, issue date,
            and expiry. Credentials nearing expiry appear in HR notifications.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Close form" : "Grant qualification"}
        </button>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {showCreate ? (
        <form className="supply-form" onSubmit={submitGrant}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New governed qualification</p>
              <h2>Grant a qualification</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "grant" ? "Granting…" : "Grant"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Person
              <select name="personId" className="input" required>
                <option value="">Select person</option>
                {activePeople.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.givenName} {item.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Name
              <input
                name="name"
                className="input"
                placeholder="Food handler card"
                required
              />
            </label>
            <label className="field-label">
              Issued
              <input name="issuedAt" className="input" type="date" required />
            </label>
            <label className="field-label">
              Type
              <input
                name="certificationType"
                className="input"
                list="certification-type-options"
                placeholder="food_handler"
                required
              />
              <datalist id="certification-type-options">
                {certificationTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="field-label">
              Issuing body
              <input
                name="issuingBody"
                className="input"
                placeholder="County health department"
                required
              />
            </label>
            <label className="field-label">
              Expires
              <input name="expiresAt" className="input" type="date" />
            </label>
            <label className="field-label">
              Document ref
              <input name="documentRef" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Credentials</p>
            <h2>Qualifications</h2>
          </div>
          <span>
            {activeRows.length} on file
            {attentionCount > 0 ? ` · ${attentionCount} need attention` : ""}
          </span>
        </div>
        {qualifications === undefined || people === undefined ? (
          <TableSkeleton rows={5} />
        ) : activeRows.length === 0 ? (
          <div className="document-empty">
            <p>No qualifications are on file.</p>
            <span>Grant one against an active person.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Qualification</th>
                  <th>Issuing body</th>
                  <th>Issued</th>
                  <th>Expires</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(row.personId)}</strong>
                    </td>
                    <td>
                      {row.name}
                      <small>{row.certificationType || "Unclassified"}</small>
                    </td>
                    <td>{row.issuingBody || "—"}</td>
                    <td>{row.issuedAt ? formatDate(row.issuedAt) : "—"}</td>
                    <td>
                      {row.expiresAt ? formatDate(row.expiresAt) : "—"}
                      {(() => {
                        const expiry = expiryLabel(row.expiresAt, now);
                        return expiry ? (
                          <small className={expiry.className}>
                            {expiry.label}
                          </small>
                        ) : null;
                      })()}
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .qualificationActions(String(row.status))
                          // Generated expire guards `expiresAt != null`; do
                          // not offer an action that can never succeed.
                          .filter(
                            (action) =>
                              action.key !== "expire" || row.expiresAt != null,
                          )
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invoke(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
