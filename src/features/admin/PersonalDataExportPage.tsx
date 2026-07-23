import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
} from "../../ui/primitives";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { AdminWorkspaceNav } from "./AdminWorkspaceNav";
import {
  createPersonalDataExportDocument,
  type PersonalDataExportFormat,
  type PersonalDataPackage,
  type PersonalDataSubject,
} from "./personalDataExport";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

export function PersonalDataExportPage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const canExport = ADMIN_ROLES.has(authStatus?.role ?? "");
  const subjects = useQuery(
    api.personalDataExport.listSubjects,
    canExport ? {} : "skip",
  );
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const selected = subjects?.find(
    (subject) => subjectKey(subject) === selectedKey,
  );
  const dataPackage = useQuery(
    api.personalDataExport.getSubjectPackage,
    selected ? { subjectType: selected.type, subjectId: selected.id } : "skip",
  );

  if (authStatus === undefined) {
    return (
      <QueryLoadState
        loadingTooLong={false}
        title="Loading data exports"
        detail="Checking organization access."
      />
    );
  }

  return (
    <PersonalDataExportView
      canExport={canExport}
      subjects={subjects}
      search={search}
      selectedKey={selectedKey}
      dataPackage={dataPackage}
      onSearchChange={setSearch}
      onSelectedKeyChange={setSelectedKey}
    />
  );
}

export function PersonalDataExportView({
  canExport,
  subjects,
  search,
  selectedKey,
  dataPackage,
  onSearchChange,
  onSelectedKeyChange,
}: {
  canExport: boolean;
  subjects: readonly PersonalDataSubject[] | undefined;
  search: string;
  selectedKey: string;
  dataPackage: PersonalDataPackage | null | undefined;
  onSearchChange: (value: string) => void;
  onSelectedKeyChange: (value: string) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const filteredSubjects = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return subjects ?? [];
    return (subjects ?? []).filter((subject) =>
      [subject.displayName, subject.email, subject.detail, subject.status]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(needle)),
    );
  }, [search, subjects]);
  const selected = subjects?.find(
    (subject) => subjectKey(subject) === selectedKey,
  );
  const sections = dataPackage
    ? Object.entries(dataPackage.records).filter(
        ([, records]) => records.length,
      )
    : [];
  const recordCount = sections.reduce(
    (total, [, records]) => total + records.length,
    0,
  );

  function download(format: PersonalDataExportFormat) {
    if (!dataPackage) return;
    const document = createPersonalDataExportDocument(dataPackage, format);
    const url = URL.createObjectURL(
      new Blob([document.contents], { type: document.mimeType }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = document.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice(
      `${format.toUpperCase()} package downloaded for ${dataPackage.subject.displayName}.`,
    );
  }

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="Personal data exports"
        lead="Prepare a complete, portable record for a client contact or staff person without database access."
      />
      <AdminWorkspaceNav />

      {!canExport ? (
        <div className="card border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          Only an organization admin can prepare personal data exports.
        </div>
      ) : null}
      {notice ? (
        <p
          className="card border-ok/30 bg-ok-soft px-4 py-3 text-[13px] text-ok"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {canExport ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <Section title="Find an individual" count={filteredSubjects.length}>
            <div className="border-b border-line p-3">
              <label className="field-label" htmlFor="personal-data-search">
                Name or email
              </label>
              <input
                id="personal-data-search"
                type="search"
                value={search}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                placeholder="Search client contacts and staff"
                className="mt-1 w-full"
              />
            </div>

            {subjects === undefined ? (
              <QueryLoadState
                loadingTooLong={false}
                title="Loading people"
                detail="Reading client contacts and staff."
              />
            ) : filteredSubjects.length === 0 ? (
              <EmptyState
                title="No matching people"
                hint="Try another name, email, role, or status."
              />
            ) : (
              <fieldset className="max-h-[32rem] divide-y divide-line overflow-y-auto">
                <legend className="sr-only">Choose a person to export</legend>
                {filteredSubjects.map((subject) => {
                  const key = subjectKey(subject);
                  const active = key === selectedKey;
                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition ${
                        active ? "bg-info-soft" : "hover:bg-inset"
                      }`}
                    >
                      <input
                        type="radio"
                        name="personal-data-subject"
                        value={key}
                        checked={active}
                        onChange={() => {
                          setNotice(null);
                          onSelectedKeyChange(key);
                        }}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <strong className="text-ink">
                            {subject.displayName}
                          </strong>
                          <span className="chip border-line-2 bg-inset text-ink-2">
                            {subject.type === "staff"
                              ? "Staff"
                              : "Client contact"}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[12px] text-ink-3">
                          {[subject.email, subject.detail, subject.status]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </Section>

          <Section title="Export package" count={recordCount || undefined}>
            {!selected ? (
              <EmptyState
                title="Choose a person"
                hint="Their available records and download formats will appear here."
              />
            ) : dataPackage === undefined ? (
              <QueryLoadState
                loadingTooLong={false}
                title="Preparing package"
                detail={`Collecting records associated with ${selected.displayName}.`}
              />
            ) : dataPackage === null ? (
              <ErrorState
                title="This person is no longer available"
                detail="Refresh the page and choose the person again."
              />
            ) : (
              <div className="p-4">
                <div className="rounded-sm border border-line-2 bg-inset p-4">
                  <p className="eyebrow">Ready to download</p>
                  <h3 className="mt-1 font-display text-xl text-ink">
                    {dataPackage.subject.displayName}
                  </h3>
                  <p className="mt-1 text-[12px] text-ink-3">
                    {recordCount} {recordCount === 1 ? "record" : "records"}{" "}
                    across {sections.length}{" "}
                    {sections.length === 1 ? "section" : "sections"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => download("json")}
                    >
                      Download JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => download("csv")}
                    >
                      Download CSV
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">
                    Included sections
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {sections.map(([name, records]) => (
                      <li
                        key={name}
                        className="flex items-center justify-between rounded-xs border border-line px-3 py-2 text-[12px]"
                      >
                        <span className="text-ink-2">{labelSection(name)}</span>
                        <span className="font-mono text-ink-3">
                          {records.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
                  JSON preserves the complete nested structure. CSV uses
                  section, record, field, and value columns so mixed record
                  types stay in one spreadsheet-safe file.
                </p>
              </div>
            )}
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function subjectKey(subject: Pick<PersonalDataSubject, "id" | "type">): string {
  return `${subject.type}:${subject.id}`;
}

function labelSection(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/^./u, (character) => character.toUpperCase());
}
