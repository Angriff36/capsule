export type ImportSourceMode = "paste" | "files";

export interface ImportSourceSnapshot {
  mode: ImportSourceMode;
  source: string;
  sheetCsv: string;
  linesCsv: string;
  fileLoading?: boolean;
  textFilename?: string;
}

export interface ImportSourceReadiness {
  ready: boolean;
  message?: string;
  kind: "paste_text" | "text_file" | "csv_bundle" | "none";
}

/**
 * Determines whether the import workbench has enough source input to parse.
 */
export class ImportSourceReadinessChecker {
  evaluate(snapshot: ImportSourceSnapshot): ImportSourceReadiness {
    if (snapshot.fileLoading) {
      return {
        ready: false,
        kind: "none",
        message: "Reading the selected file…",
      };
    }

    const source = snapshot.source.trim();
    const hasSheet = snapshot.sheetCsv.trim().length > 0;
    const hasLines = snapshot.linesCsv.trim().length > 0;

    if (snapshot.mode === "paste") {
      if (!source) {
        return {
          ready: false,
          kind: "none",
          message: "Paste component text before parsing.",
        };
      }
      return { ready: true, kind: "paste_text" };
    }

    if (hasSheet && hasLines) {
      return { ready: true, kind: "csv_bundle" };
    }
    if (source) {
      return { ready: true, kind: "text_file" };
    }
    if (hasSheet || hasLines) {
      return {
        ready: false,
        kind: "none",
        message:
          "Load both component sheet and component lines CSV files, or choose a .txt component file.",
      };
    }
    return {
      ready: false,
      kind: "none",
      message:
        "Choose a .txt component file or load the paired CSV bundle before parsing.",
    };
  }

  fileStatusLabel(snapshot: ImportSourceSnapshot): string | null {
    if (snapshot.mode !== "files") return null;

    const hasSheet = snapshot.sheetCsv.trim().length > 0;
    const hasLines = snapshot.linesCsv.trim().length > 0;
    const hasText = snapshot.source.trim().length > 0;

    if (hasText && snapshot.textFilename) {
      return `${snapshot.textFilename} loaded`;
    }
    if (hasSheet && hasLines) {
      return `CSV bundle ready · sheet ${this.countRows(snapshot.sheetCsv)} rows · lines ${this.countRows(snapshot.linesCsv)} rows`;
    }
    if (hasSheet) {
      return `Component sheet loaded · ${this.countRows(snapshot.sheetCsv)} rows · add component_lines.csv to continue`;
    }
    if (hasLines) {
      return `Component lines loaded · ${this.countRows(snapshot.linesCsv)} rows · add component_sheet.csv to continue`;
    }
    return null;
  }

  private countRows(csv: string): number {
    return csv.replaceAll("\r\n", "\n").split("\n").filter(Boolean).length;
  }
}
