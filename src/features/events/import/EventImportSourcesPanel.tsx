import { useState } from "react";
import type { TextReportSource } from "../../../lib/tppReports/loadEventBundleFromText";
import { isRtf, rtfToText } from "../../../lib/tppReports/rtfToText";
import { XlsxReportGrid } from "../../../lib/tppReports/xlsxReportGrid";
import { readXlsxWorkbookFromEntries } from "../../../lib/tppReports/xlsxWorkbookParser";
import { readZipEntriesInBrowser } from "../../../lib/tppReports/zipReaderBrowser";

type Props = {
  pastedText: string;
  onPastedTextChange: (text: string) => void;
  csvFiles: readonly TextReportSource[];
  onCsvFilesChange: (files: TextReportSource[]) => void;
  disabled: boolean;
};

const PLACEHOLDER = `Invoice #: 5935
Event Title: Ewing Wedding
Date: 9/26/2026
Event Time: 4:00 PM - 10:00 PM
Guest Count: 30
Contact: Kamini Singh (208) 555-1234 kamini@example.com
Location: Singh Campsite 47.01359 N, 116.52979 W

Timeline
1:00 PM  Load in
5:30 PM  Dinner service

Menu
Dinner Buffet
30 Serving  Grilled Tri Tip
**Blue rare for bride & groom, medium rare for everyone else
15 Serving  Idaho Wild Rice Pilaf

Staff
FOH Captain  *Unassigned*  2:00 PM - 10:30 PM`;

/**
 * Where the report comes from: text copied out of the BEO / worksheet PDF,
 * and any TPP CSV exports. Reading happens in the page; nothing is uploaded
 * until the person clicks Create on the review step.
 */
export function EventImportSourcesPanel({
  pastedText,
  onPastedTextChange,
  csvFiles,
  onCsvFilesChange,
  disabled,
}: Props) {
  const [readError, setReadError] = useState<string | null>(null);

  const readFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setReadError(null);
    const next: TextReportSource[] = [...csvFiles];
    let pasted = pastedText;
    // One BEO at a time: two .rtf reports joined into one text would read as
    // one event and put one report's menu on the other's header.
    const rtfFiles = Array.from(list).filter((file) =>
      /\.rtf$/i.test(file.name),
    );
    if (rtfFiles.length > 1) {
      setReadError(
        `${rtfFiles.length} .rtf reports were chosen; only ${rtfFiles[0]!.name} was read. Import one BEO at a time.`,
      );
    }
    for (const file of Array.from(list)) {
      // TPP saves the BEO and the worksheet as .rtf: read it into the text box.
      if (/\.rtf$/i.test(file.name)) {
        if (file !== rtfFiles[0]) continue;
        try {
          const text = await file.text();
          if (!isRtf(text)) throw new Error("not rtf");
          // The report replaces whatever was in the box; it never joins it.
          pasted = rtfToText(text);
        } catch {
          setReadError(`${file.name} could not be read.`);
        }
        continue;
      }
      // TPP "Save As → Excel": unzip and read the workbook here in the page.
      if (/\.xlsx$/i.test(file.name)) {
        try {
          const entries = await readZipEntriesInBrowser(
            new Uint8Array(await file.arrayBuffer()),
          );
          const sheets = XlsxReportGrid.fromWorkbook(
            readXlsxWorkbookFromEntries(entries),
          );
          next.push({ name: file.name, text: "", sheets });
        } catch {
          setReadError(`${file.name} could not be read as an Excel workbook.`);
        }
        continue;
      }
      if (!/\.csv$/i.test(file.name)) {
        setReadError(
          `${file.name}: only .rtf, .xlsx and .csv exports are read here. Save the report as Excel or CSV, or copy its text into the box above.`,
        );
        continue;
      }
      try {
        next.push({ name: file.name, text: await file.text() });
      } catch {
        setReadError(`${file.name} could not be read.`);
      }
    }
    onCsvFilesChange(next);
    if (pasted !== pastedText) onPastedTextChange(pasted);
  };

  return (
    <section className="card space-y-3 p-4" data-testid="event-import-sources">
      <label className="field-label">
        Paste the BEO or event worksheet text
        <textarea
          className="input min-h-72 py-2 font-mono text-sm"
          value={pastedText}
          onChange={(event) => onPastedTextChange(event.target.value)}
          placeholder={PLACEHOLDER}
          disabled={disabled}
          data-testid="event-import-paste"
          spellCheck={false}
        />
        <span className="field-hint">
          Select all in the PDF, copy, paste. “Label: value” lines fill the
          header; a line starting with a clock time is a timeline row; a line
          starting with a count (“30 Serving”) is a menu row; “**” or “Note:”
          lines attach to the dish above; “*Unassigned*” staff rows become open
          shifts.
        </span>
      </label>

      <div className="space-y-1">
        <label className="field-label">
          Add TPP exports: BEO .rtf, or Excel / CSV reports (optional)
          <input
            type="file"
            accept=".rtf,.xlsx,.csv,text/csv,application/rtf,text/rtf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="input py-1.5"
            disabled={disabled}
            onChange={(event) => {
              void readFiles(event.target.files);
              event.target.value = "";
            }}
            data-testid="event-import-files"
          />
          <span className="field-hint">
            A BEO saved from TPP as .rtf is read into the box above. Reports
            saved as Excel or CSV (BEO, Event Worksheet, Production Worksheet,
            Pack List, Proposal, Order List) are recognized by their content.
            Where the worksheet and the BEO disagree, the worksheet count is
            used and the disagreement is flagged for review on the event.
          </span>
        </label>
        {csvFiles.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {csvFiles.map((file) => (
              <li
                key={file.name}
                className="chip inline-flex items-center gap-1.5"
              >
                {file.name}
                <button
                  type="button"
                  className="text-ink-3 hover:text-ink"
                  aria-label={`Remove ${file.name}`}
                  disabled={disabled}
                  onClick={() =>
                    onCsvFilesChange(csvFiles.filter((f) => f !== file))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {readError ? (
          <p className="text-sm text-danger" role="alert">
            {readError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
