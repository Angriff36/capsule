import { useState } from "react";
import { formatStatusLabel } from "../../lib/statusLabels";
import { EmptyState, Section } from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import {
  buildRolePermissionAuditSnapshot,
  rolePermissionAuditToCsv,
  type RolePermissionAuditMemberSource,
  type RolePermissionAuditSnapshot,
} from "./rolePermissionAudit";

const snapshotTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RolePermissionAudit({
  members,
  loading,
}: {
  members: readonly RolePermissionAuditMemberSource[];
  loading: boolean;
}) {
  return <RolePermissionAuditView members={members} loading={loading} />;
}

export function RolePermissionAuditView({
  members,
  loading = false,
}: {
  members: readonly RolePermissionAuditMemberSource[];
  loading?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<RolePermissionAuditSnapshot | null>(
    null,
  );

  function generateSnapshot() {
    setSnapshot(buildRolePermissionAuditSnapshot(members));
  }

  function downloadSnapshot() {
    if (!snapshot) return;
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", rolePermissionAuditToCsv(snapshot)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "role-permission-audit-" +
      snapshot.generatedAt.replace(/[:.]/gu, "-") +
      ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Section title="Role permission audit" count={snapshot?.members.length}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-4">
        <div className="max-w-2xl">
          <p className="font-medium text-ink">Who can do what</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">
            Capture every current team member, their role, and everything that
            role lets them do. Broader access is highlighted so you can review
            it from time to time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={generateSnapshot}
            disabled={loading}
            data-testid="role-audit-generate"
          >
            {snapshot ? "Refresh snapshot" : "Generate snapshot"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={downloadSnapshot}
            disabled={!snapshot}
            data-testid="role-audit-download"
          >
            Download CSV
          </button>
        </div>
      </div>

      {loading ? (
        <QueryLoadState
          loadingTooLong={false}
          title="Loading organization members"
          detail="Reading current roles before the snapshot is generated."
        />
      ) : snapshot === null ? (
        <EmptyState
          title="No snapshot generated"
          hint="Generate a point-in-time report when you are ready to review access."
        />
      ) : (
        <div data-testid="role-audit-snapshot">
          <div className="grid border-b border-line bg-inset sm:grid-cols-3">
            <SnapshotMetric
              label="Snapshot time"
              value={snapshotTime.format(new Date(snapshot.generatedAt))}
            />
            <SnapshotMetric
              label="Current members"
              value={String(snapshot.members.length)}
            />
            <SnapshotMetric
              label="Elevated access"
              value={String(snapshot.elevatedMemberCount)}
              warn={snapshot.elevatedMemberCount > 0}
            />
          </div>

          {snapshot.members.length === 0 ? (
            <EmptyState
              title="No current organization members"
              hint="The report will include members as soon as they are added to the organization."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] border-collapse text-left">
                <thead>
                  <tr>
                    <th className="th">Member</th>
                    <th className="th">Assigned role</th>
                    <th className="th">What this role can do</th>
                    <th className="th">Access review</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.members.map((member) => (
                    <tr
                      key={member.id}
                      className="align-top"
                      data-testid="role-audit-member-row"
                    >
                      <td className="border-b border-line px-3 py-3">
                        <strong className="block text-ink">
                          {member.displayName}
                        </strong>
                        <span className="mt-0.5 block text-xs text-ink-3">
                          {member.email} · {formatStatusLabel(member.status)}
                        </span>
                      </td>
                      <td className="border-b border-line px-3 py-3">
                        <span className="chip border-line-2 bg-inset text-ink-2">
                          {member.roleLabel}
                        </span>
                        <code className="mt-1.5 block text-2xs text-ink-3">
                          {member.role}
                        </code>
                      </td>
                      <td className="border-b border-line px-3 py-3">
                        {member.manifestPolicies.length === 0 ? (
                          <span className="text-xs text-danger">
                            This role grants no recognized access
                          </span>
                        ) : (
                          <div className="flex max-w-xl flex-wrap gap-1.5">
                            {member.manifestPolicies.map((policy) => {
                              const elevated =
                                member.elevatedPolicies.includes(policy);
                              return (
                                <code
                                  key={policy}
                                  className={
                                    "rounded-xs border px-1.5 py-1 text-2xs " +
                                    (elevated
                                      ? "border-warn/30 bg-warn-soft text-warn"
                                      : "border-line bg-inset text-ink-2")
                                  }
                                >
                                  {policy}
                                </code>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="border-b border-line px-3 py-3">
                        {member.hasElevatedAccess ? (
                          <div>
                            <span className="chip border-warn/30 bg-warn-soft text-warn">
                              Elevated access
                            </span>
                            <p className="mt-1.5 max-w-xs text-2xs leading-relaxed text-ink-3">
                              {member.elevatedPolicies.join(", ")}
                            </p>
                          </div>
                        ) : (
                          <span className="chip border-ok/30 bg-ok-soft text-ok">
                            Standard access
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="px-4 py-3 text-2xs leading-relaxed text-ink-3">
            Highlighted items grant lead, manager, or admin-level access. A
            highlight is a prompt to review — it doesn't block anyone from
            working.
          </p>
        </div>
      )}
    </Section>
  );
}

function SnapshotMetric({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="border-line px-4 py-3 not-first:border-l">
      <span className="meta-term block">{label}</span>
      <strong
        className={
          "mt-1 block font-mono text-base " + (warn ? "text-warn" : "text-ink")
        }
      >
        {value}
      </strong>
    </div>
  );
}
