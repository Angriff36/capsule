import { parseCsv } from "../../../lib/tppMenuCsv";
import { XlsxReportGrid } from "../../../lib/tppReports/xlsxReportGrid";
import { readXlsxWorkbookFromEntries } from "../../../lib/tppReports/xlsxWorkbookParser";
import { readZipEntriesInBrowser } from "../../../lib/tppReports/zipReaderBrowser";

/** The first sheet of an old-system .xlsx or .csv file as rows of cell text. */
export async function sourceFileGrid(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const entries = await readZipEntriesInBrowser(
    new Uint8Array(await file.arrayBuffer()),
  );
  return (
    XlsxReportGrid.fromWorkbook(readXlsxWorkbookFromEntries(entries))[0]
      ?.rows ?? []
  );
}
