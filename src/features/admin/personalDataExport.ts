export type PersonalDataSubjectType = "client_contact" | "staff";

export interface PersonalDataSubject {
  id: string;
  type: PersonalDataSubjectType;
  displayName: string;
  email: string | null;
  status: string;
  detail: string;
}

export interface PersonalDataPackage {
  schemaVersion: number;
  organizationId: string;
  subject: PersonalDataSubject;
  records: Record<string, readonly unknown[]>;
}

export type PersonalDataExportFormat = "csv" | "json";

export interface PersonalDataExportDocument {
  filename: string;
  mimeType: string;
  contents: string;
}

export function createPersonalDataExportDocument(
  dataPackage: PersonalDataPackage,
  format: PersonalDataExportFormat,
  exportedAt = new Date(),
): PersonalDataExportDocument {
  const date = exportedAt.toISOString().slice(0, 10);
  const stem = `personal-data-${slugify(dataPackage.subject.displayName)}-${date}`;
  const payload = {
    ...dataPackage,
    exportedAt: exportedAt.toISOString(),
  };

  if (format === "json") {
    return {
      filename: `${stem}.json`,
      mimeType: "application/json;charset=utf-8",
      contents: `${JSON.stringify(payload, null, 2)}\n`,
    };
  }

  return {
    filename: `${stem}.csv`,
    mimeType: "text/csv;charset=utf-8",
    contents: packageToCsv(payload),
  };
}

function packageToCsv(
  dataPackage: PersonalDataPackage & { exportedAt: string },
): string {
  const rows: string[][] = [["section", "record_id", "field", "value"]];
  const appendFields = (section: string, recordId: string, value: unknown) => {
    const record = isRecord(value) ? value : { value };
    for (const [field, fieldValue] of Object.entries(record).sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      rows.push([section, recordId, field, formatValue(fieldValue)]);
    }
  };

  appendFields("package", "package", {
    schemaVersion: dataPackage.schemaVersion,
    organizationId: dataPackage.organizationId,
    exportedAt: dataPackage.exportedAt,
  });
  appendFields("subject", dataPackage.subject.id, dataPackage.subject);

  for (const [section, records] of Object.entries(dataPackage.records)) {
    records.forEach((record, index) => {
      const recordId =
        isRecord(record) && typeof record._id === "string"
          ? record._id
          : `${section}-${index + 1}`;
      appendFields(section, recordId, record);
    });
  }

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return protectSpreadsheetCell(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function protectSpreadsheetCell(value: string): string {
  return /^[=+@-]/u.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return slug || "person";
}
