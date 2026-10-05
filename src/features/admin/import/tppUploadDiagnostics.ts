/** Diagnostics contain identifiers and errors, never source records or signed
 * upload URLs. Keep late server completions safe: a timeout stops the browser's
 * wait, not a Convex transaction; resume uses the durable batch receipt. */
export const TPP_STALL_MS = 45_000;
export const TPP_REQUEST_TIMEOUT_MS = 180_000;

export function importTimeout<T>(
  operation: Promise<T>,
  label: string,
  milliseconds = TPP_REQUEST_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              `${label} did not respond within ${Math.round(milliseconds / 1000)} seconds. Retry to check saved progress; the server may still finish this batch.`,
            ),
          ),
        ),
      milliseconds,
    );
    const cancel = () =>
      finish(() => reject(new DOMException("Import paused", "AbortError")));
    function finish(done: () => void) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      done();
    }
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

export function uploadTppPart(
  url: string,
  blob: Blob,
  signal: AbortSignal,
  progress: (bytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cancel = () => request.abort();
    const settle = (done: () => void) => {
      signal.removeEventListener("abort", cancel);
      done();
    };
    request.open("POST", url);
    request.timeout = TPP_REQUEST_TIMEOUT_MS;
    request.setRequestHeader(
      "Content-Type",
      blob.type || "application/octet-stream",
    );
    request.upload.onprogress = (event) => progress(event.loaded);
    request.onerror = () =>
      settle(() =>
        reject(
          new Error(
            "The upload connection failed. Check your connection and retry; completed batches are saved.",
          ),
        ),
      );
    request.ontimeout = () =>
      settle(() =>
        reject(
          new Error(
            "The file upload timed out after 180 seconds. Retry to resume saved progress.",
          ),
        ),
      );
    request.onabort = () =>
      settle(() => reject(new DOMException("Import paused", "AbortError")));
    request.onload = () =>
      settle(() => {
        if (request.status < 200 || request.status >= 300) {
          reject(
            new Error(
              `File upload failed: HTTP ${request.status} ${request.statusText}. Request ID: ${request.getResponseHeader("x-request-id") || "unavailable"}.`,
            ),
          );
          return;
        }
        try {
          const result: unknown = JSON.parse(request.responseText);
          if (
            !result ||
            typeof result !== "object" ||
            !("storageId" in result) ||
            typeof result.storageId !== "string"
          )
            throw new Error(
              "The upload response did not contain a storage identifier.",
            );
          resolve(result.storageId);
        } catch (error) {
          reject(error);
        }
      });
    if (signal.aborted) {
      reject(new DOMException("Import paused", "AbortError"));
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
    try {
      request.send(blob);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

export function diagnosticJson(value: unknown): string {
  return JSON.stringify(
    value,
    (key, entry: unknown) => {
      if (
        /^(authorization|cookie|token|secret|password|storageId|rawSourceData)$/i.test(
          key,
        )
      )
        return "[redacted]";
      if (typeof entry !== "string") return entry;
      return entry
        .replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
          try {
            const url = new URL(raw);
            url.search = "";
            url.hash = "";
            url.username = "";
            url.password = "";
            return url.toString();
          } catch {
            return "[URL redacted]";
          }
        })
        .replace(/Bearer\s+[\w.\-]+/gi, "Bearer [redacted]");
    },
    2,
  );
}

export type DiagnosticPart = {
  sequence: number;
  collection: string;
  rowCount: number;
  byteSize: number;
  checksum: string;
  outcome: string;
};
type DiagnosticPage = {
  page: DiagnosticPart[];
  isDone: boolean;
  continueCursor: string;
};
export async function collectImportFailures(
  load: (cursor: string | null) => Promise<{
    page: DiagnosticPart[];
    isDone: boolean;
    continueCursor: string;
  }>,
  milliseconds = 30_000,
) {
  const batches: Omit<DiagnosticPart, "outcome">[] = [];
  const failures: { sequence: number; collection: string; details: unknown }[] =
    [];
  let cursor: string | null = null;
  const deadline = Date.now() + milliseconds;
  try {
    do {
      const result: DiagnosticPage = await importTimeout(
        load(cursor),
        "Loading saved diagnostic batches",
        Math.max(1, deadline - Date.now()),
      );
      for (const part of result.page) {
        const { outcome, ...receipt } = part;
        // Select fields explicitly: never export storage IDs or source data.
        batches.push({
          sequence: receipt.sequence,
          collection: receipt.collection,
          rowCount: receipt.rowCount,
          byteSize: receipt.byteSize,
          checksum: receipt.checksum,
        });
        let details: unknown;
        try {
          details = JSON.parse(outcome);
        } catch {
          details = { unreadableOutcome: outcome };
        }
        if (
          details &&
          typeof details === "object" &&
          ("unreadableOutcome" in details ||
            ("failures" in details &&
              Array.isArray(details.failures) &&
              details.failures.length))
        )
          failures.push({
            sequence: part.sequence,
            collection: part.collection,
            details,
          });
      }
      if (result.isDone) return { complete: true, batches, failures };
      if (!result.continueCursor || result.continueCursor === cursor)
        throw new Error("Diagnostic pagination stopped advancing.");
      cursor = result.continueCursor;
      if (Date.now() >= deadline)
        throw new Error(
          "Diagnostic download reached its time limit. Retry downloading for the remaining saved batches.",
        );
    } while (true);
  } catch (error) {
    return {
      complete: false,
      batches,
      failures,
      collectionError: error instanceof Error ? error.message : String(error),
      nextCursor: cursor,
    };
  }
}
