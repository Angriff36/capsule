export const DEFAULT_INVOICE_REMINDER_OFFSETS_DAYS = [7, 0, -3, -14] as const;

const MAX_REMINDERS = 12;
const MAX_OFFSET_DAYS = 365;
export const DAY_MS = 86_400_000;

export function normalizeInvoiceReminderOffsets(
  values: readonly number[],
): number[] {
  if (values.length === 0) {
    throw new TypeError("Add at least one reminder day.");
  }
  const normalized = values.map((value) => {
    if (!Number.isInteger(value)) {
      throw new TypeError("Reminder days must be whole numbers.");
    }
    if (Math.abs(value) > MAX_OFFSET_DAYS) {
      throw new TypeError(
        `Reminder days must be between -${MAX_OFFSET_DAYS} and ${MAX_OFFSET_DAYS}.`,
      );
    }
    return value;
  });
  const unique = [...new Set(normalized)].sort((left, right) => right - left);
  if (unique.length > MAX_REMINDERS) {
    throw new TypeError(`Use no more than ${MAX_REMINDERS} reminder dates.`);
  }
  return unique;
}

export function parseInvoiceReminderOffsets(value: string): number[] {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return normalizeInvoiceReminderOffsets([]);
  return normalizeInvoiceReminderOffsets(
    parts.map((part) => {
      if (!/^-?\d+$/u.test(part)) {
        throw new TypeError(
          "Use comma-separated whole days, such as 7, 0, -3, -14.",
        );
      }
      return Number(part);
    }),
  );
}

export function reminderOffsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return "on the due date";
  if (offsetDays > 0) {
    return `${offsetDays} day${offsetDays === 1 ? "" : "s"} before due`;
  }
  const overdueDays = Math.abs(offsetDays);
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

export function reminderScheduledAt(
  dueDate: number,
  offsetDays: number,
): number {
  return dueDate - offsetDays * DAY_MS;
}
