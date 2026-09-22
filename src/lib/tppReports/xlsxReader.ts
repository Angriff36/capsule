import { readZipEntries } from "./zipReader";
import {
  readXlsxSheetsFromEntries,
  readXlsxWorkbookFromEntries,
  type XlsxSheet,
  type XlsxTypedWorkbook,
} from "./xlsxWorkbookParser";

/**
 * The Node entry points: unzip with the hardened zip reader, then parse.
 * The parsing itself lives in xlsxWorkbookParser.ts, which has no Node in
 * it, so the browser importer reads the same .xlsx with its own unzip
 * (zipReaderBrowser.ts).
 */
export * from "./xlsxWorkbookParser";

/** Read every worksheet of an .xlsx file as a string grid. */
export function readXlsxSheets(buffer: Buffer): XlsxSheet[] {
  return readXlsxSheetsFromEntries(readZipEntries(buffer));
}

export function readXlsxWorkbook(buffer: Buffer): XlsxTypedWorkbook {
  return readXlsxWorkbookFromEntries(readZipEntries(buffer));
}
