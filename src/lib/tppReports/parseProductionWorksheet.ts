import type { BundlePrepTask, EventBundlePart } from "./eventBundle";
import { valueAfterLabel } from "./csvRows";
import { titleCase } from "./reportValues";
import type { XlsxSheet } from "./xlsxReader";

/**
 * Parses the TPP production worksheet — the kitchen's view of the event.
 *
 * Rows alternate between an item row, which names a menu item and its category
 * and servings, and the task rows below it, which are the prep work. Item names
 * are shouted in the export and are title-cased here so they match the BEO.
 */

const PRINTED_FOOTER = /^printed date:/i;
const PARENT_SERVINGS = /^P:\s*([\d.]+)/i;

function isColumnHeader(row: readonly string[]): boolean {
  return row[0] === "Category" && (row[1] ?? "").startsWith("Quantity");
}

function readPrepTasks(rows: readonly string[][]): BundlePrepTask[] {
  const tasks: BundlePrepTask[] = [];
  let category: string | undefined;
  let dishName: string | undefined;
  let parentServings: number | undefined;
  let specialInstructions: string | undefined;

  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    if (
      first.length === 0 ||
      isColumnHeader(row) ||
      PRINTED_FOOTER.test(first)
    ) {
      continue;
    }

    const servings = (row[1] ?? "").match(PARENT_SERVINGS);
    if (servings) {
      category = first;
      dishName = titleCase((row[4] ?? "").trim());
      const count = Number(servings[1]);
      parentServings = Number.isFinite(count) ? count : undefined;
      const note = (row[6] ?? "").trim();
      specialInstructions = note.length > 0 ? note : undefined;
      continue;
    }

    // A task row: quantity in the first column, unit and task name after it.
    const quantity = Number(first);
    const name = (row[5] ?? "").trim();
    if (!Number.isFinite(quantity) || name.length === 0) continue;
    if (category === undefined || dishName === undefined) continue;

    const task: BundlePrepTask = {
      category,
      dishName,
      name: titleCase(name),
      quantity,
    };
    const unit = (row[3] ?? "").trim();
    if (unit.length > 0) task.unit = unit;
    if (parentServings !== undefined) task.parentServings = parentServings;
    if (specialInstructions !== undefined) {
      task.specialInstructions = specialInstructions;
    }
    tasks.push(task);
  }
  return tasks;
}

/**
 * An item with no task rows still needs producing, so it becomes one task.
 * "Watermelon / Serve in wedges" is a whole prep line in the kitchen's terms.
 */
function readItemsWithoutTasks(
  rows: readonly string[][],
  tasks: readonly BundlePrepTask[],
): BundlePrepTask[] {
  const covered = new Set(tasks.map((task) => task.dishName));
  const extras: BundlePrepTask[] = [];

  for (const row of rows) {
    const servings = (row[1] ?? "").match(PARENT_SERVINGS);
    if (!servings) continue;
    const dishName = titleCase((row[4] ?? "").trim());
    if (dishName.length === 0 || covered.has(dishName)) continue;
    covered.add(dishName);

    const count = Number(servings[1]);
    const note = (row[6] ?? "").trim();
    const task: BundlePrepTask = {
      category: (row[0] ?? "").trim(),
      dishName,
      name: dishName,
      unit: "serving",
    };
    if (Number.isFinite(count)) {
      task.quantity = count;
      task.parentServings = count;
    }
    if (note.length > 0) task.specialInstructions = note;
    extras.push(task);
  }
  return extras;
}

/** Parse a production worksheet into its bundle contribution. */
export function parseProductionWorksheet(
  sheets: readonly XlsxSheet[],
): EventBundlePart {
  const rows = sheets.flatMap((sheet) => sheet.rows);
  const label = (name: string) => {
    for (const row of rows) {
      const value = valueAfterLabel(row, name);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const tasks = readPrepTasks(rows);
  const invoiceRow = rows.find((row) =>
    (row[0] ?? "").toLowerCase().startsWith("invoice #"),
  );
  const invoiceNumber =
    label("Invoice #") ?? invoiceRow?.filter((cell) => /^\d+$/.test(cell))[0];

  const part: EventBundlePart = {
    source: "productionWorksheet",
    header: invoiceNumber === undefined ? {} : { invoiceNumber },
    venue: { name: label("Site") },
    prepTasks: [...tasks, ...readItemsWithoutTasks(rows, tasks)],
  };

  if (part.prepTasks?.length === 0) {
    part.warnings = ["Production worksheet: no prep tasks were recognized."];
  }
  return part;
}
