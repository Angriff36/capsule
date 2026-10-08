import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  usePayRates,
  usePayrollTimeRecords,
} from "../facilities/useLaborSummary";
import {
  useCreatePayrollInput,
  useListPerson,
  usePayrollInputFinalize,
  usePayrollInputMarkVoided,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FINANCE_ROUTES } from "./financeRoutes";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { PayrollExportPanel } from "./PayrollExportPanel";
import { buildPayrollExport, type PayrollProcessor } from "./payrollExport";
import {
  clockedMinutesForPerson,
  dayEndExclusiveOfTimestamp,
  dayStartOfTimestamp,
} from "./payrollPeriod";
import { PayrollWorksheet } from "./PayrollWorksheet";
import { localDayEndExclusive, localDayStart } from "./payrollPeriod";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import {
  usePagedRows,
  useRowsInStatuses,
  useWindowRows,
} from "../../lib/financeScopedQueries";
import { useActionNotice } from "../../ui/action-result";
import {
  PayrollPrepareForm,
  PayrollPreparePayloadBuilder,
} from "./PayrollPrepareForm";

const payloadBuilder = new PayrollPreparePayloadBuilder();

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const initialPeriod = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: dateInputValue(start), end: dateInputValue(today) };
};

/** The event picker is read only while the prepare form is open. */
function PrepareFormWithEvents(
  props: Omit<Parameters<typeof PayrollPrepareForm>[0], "events">,
) {
  const events = usePickerAndNamedEvents([]);
  return <PayrollPrepareForm {...props} events={events ?? []} />;
}

// Not yet finalized for export or voided.
const OPEN_STATUSES = ["draft", "prepared"];

export function PayrollPage() {
  // The worksheet shows every open input (through the status index), and
  // closed ones a page at a time only once the user shows them; the export
  // reads only inputs that start in the export period.
  const [showTerminal, setShowTerminal] = useState(false);
  const openInputs = useRowsInStatuses("payrollInputs", OPEN_STATUSES);
  const inputPages = usePagedRows("payrollInputs", showTerminal);
  const payrollInputs =
    openInputs === undefined || (showTerminal && inputPages.rows === undefined)
      ? undefined
      : [
          ...new Map(
            [...openInputs, ...(inputPages.rows ?? [])].map((row) => [
              row._id,
              row,
            ]),
          ).values(),
        ];
  // Authored seam: finance managers lack workforceAccess, so the generated
  // listTimeRecord returns [] for them — clocked hours come from laborSummary.
  const timeRecords = usePayrollTimeRecords();
  const payRates = usePayRates();
  const people = useListPerson();
  const createPayroll = useCreatePayrollInput();
  const finalize = usePayrollInputFinalize();
  const markVoided = usePayrollInputMarkVoided();
  const [showPrepare, setShowPrepare] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const [period] = useState(initialPeriod);
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [processor, setProcessor] = useState<PayrollProcessor>("gusto");
  const exportStartAt = localDayStart(periodStart);
  const exportEndAt = localDayEndExclusive(periodEnd);
  const exportInputs = useWindowRows(
    "payrollInputs",
    Number.isFinite(exportStartAt) &&
      Number.isFinite(exportEndAt) &&
      exportStartAt < exportEndAt
      ? {
          fields: ["periodStart"],
          ranges: [{ from: exportStartAt, to: exportEndAt }],
        }
      : null,
  );
  const { prompt, host } = useActionPrompt(busy != null);

  const activeRows = (payrollInputs ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const visibleRows = showTerminal
    ? activeRows
    : activeRows.filter(
        (row) => !["finalized", "voided"].includes(String(row.status)),
      );

  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "Unknown person";
  };

  // Estimated gross from pay rates (laborSummary seam — Person.hourlyRate is
  // private and stripped from listPerson). Never invent a rate.
  const ratesLoaded = Array.isArray(payRates);
  const rateByPersonId = useMemo(
    () =>
      new Map(
        (payRates ?? []).map((row) => [row.personId, row.hourlyRate] as const),
      ),
    [payRates],
  );
  const estimatedGross = (personId: string, totalHours: number) => {
    const rate = rateByPersonId.get(personId);
    if (rate == null || !Number.isFinite(rate)) return null;
    return totalHours * rate;
  };

  // Worksheet ↔ preview agreement: clocked payroll-ready minutes for the
  // input's person and period, same records and day-window as the preview.
  const clockedMinutesForInput = (row: {
    personId: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
  }): number | null => {
    if (!Array.isArray(timeRecords)) return null;
    const startAt = dayStartOfTimestamp(Number(row.periodStart));
    const endExclusiveAt = dayEndExclusiveOfTimestamp(Number(row.periodEnd));
    if (!Number.isFinite(startAt) || !Number.isFinite(endExclusiveAt)) {
      return null;
    }
    return clockedMinutesForPerson(
      timeRecords,
      String(row.personId),
      startAt,
      endExclusiveAt,
    );
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitPrepare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = payloadBuilder.fromForm(new FormData(form));
      void run("prepare-payroll", async () => {
        await createPayroll(payload);
        form.reset();
        setShowPrepare(false);
        setNotice("Payroll input prepared. Finalize when ready to export.");
      });
    } catch (error) {
      setFailure(error);
    }
  };

  const invoke = (
    row: { _id: string; version: number; status: unknown },
    key: string,
  ) => {
    void (async () => {
      if (key === "void") {
        const reason = await prompt.askReason({
          ...ReasonCopy.voidPayrollInput,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${row._id}:${key}`, async () => {
          await markVoided({
            docId: row._id,
            version: row.version,
            reason,
          });
          setNotice("Payroll input voided.");
        });
        return;
      }
      void run(`${row._id}:${key}`, async () => {
        await finalize({ docId: row._id, version: row.version });
        setNotice("Payroll input finalized.");
      });
    })();
  };

  const loading =
    payrollInputs === undefined ||
    timeRecords === undefined ||
    people === undefined;

  const payrollExport = useMemo(() => {
    if (exportInputs === undefined) return { document: null, error: null };
    try {
      return {
        document: buildPayrollExport({
          processor,
          periodStart,
          periodEnd,
          people: people ?? [],
          timeRecords: timeRecords ?? [],
          payrollInputs: exportInputs ?? [],
        }),
        error: null,
      };
    } catch (error) {
      return {
        document: null,
        error: error instanceof Error ? error.message : "Invalid pay period.",
      };
    }
  }, [exportInputs, people, periodEnd, periodStart, processor, timeRecords]);

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Finance · Payroll</p>
          <h1 className="display-title mt-2">Payroll inputs</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Prepare a period rollup for a person, then finalize for export or
            void if the numbers are wrong. Finance managers only.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowTerminal((value) => !value)}
          >
            {showTerminal ? "Hide closed" : "Show closed"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowPrepare((value) => !value)}
          >
            {showPrepare ? "Close form" : "Prepare input"}
          </button>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      <PayrollExportPanel
        // The file waits for the period's payroll inputs too, so it never
        // leaves out finalized adjustments that are still loading.
        loading={loading || exportInputs === undefined}
        periodStart={periodStart}
        periodEnd={periodEnd}
        processor={processor}
        onPeriodStartChange={setPeriodStart}
        onPeriodEndChange={setPeriodEnd}
        onProcessorChange={setProcessor}
        document={payrollExport.document}
        error={payrollExport.error}
        hourlyRateByPersonId={ratesLoaded ? rateByPersonId : null}
        onNotice={setNotice}
        onFailure={setFailure}
      />

      {showPrepare ? (
        <PrepareFormWithEvents
          people={people ?? []}
          busy={busy === "prepare-payroll"}
          onSubmit={submitPrepare}
        />
      ) : null}

      <PayrollWorksheet
        loading={loading}
        visibleRows={visibleRows}
        countLabel={
          showTerminal
            ? `${visibleRows.filter((row) => OPEN_STATUSES.includes(String(row.status))).length} open · ${visibleRows.filter((row) => !OPEN_STATUSES.includes(String(row.status))).length} closed shown`
            : undefined
        }
        personName={personName}
        clockedMinutesForInput={clockedMinutesForInput}
        estimatedGross={estimatedGross}
        busy={busy}
        onPrepare={() => setShowPrepare(true)}
        onInvoke={invoke}
      />
      {!loading && showTerminal && inputPages.canLoadMore ? (
        <div className="px-4 py-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={inputPages.loadingMore}
            onClick={inputPages.loadMore}
          >
            {inputPages.loadingMore ? "Loading…" : "Load older inputs"}
          </button>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-ink-3">
        Saved report definitions live under{" "}
        <Link className="text-link" to="/reports">
          Reports
        </Link>
        . Event closeouts live under{" "}
        <Link className="text-link" to={FINANCE_ROUTES.closeout}>
          Closeout
        </Link>
        .
      </p>
    </div>
  );
}
