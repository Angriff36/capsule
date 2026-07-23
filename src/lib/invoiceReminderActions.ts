import { useAction } from "convex/react";
import { useCallback } from "react";
import { api, type Id } from "./api";

/** Authored provider-action hooks kept outside finance feature components.
 * Invoice state changes still use generated Manifest hooks in the page. */
export function useInvoiceReminderActions() {
  const getScheduleAction = useAction(api.invoiceReminders.getSchedule);
  const configureScheduleAction = useAction(
    api.invoiceReminders.configureSchedule,
  );
  const sendNowAction = useAction(api.invoiceReminders.sendNow);

  const getSchedule = useCallback(
    (invoiceId: string) =>
      getScheduleAction({ invoiceId: invoiceId as Id<"invoices"> }),
    [getScheduleAction],
  );
  const configureSchedule = useCallback(
    (input: { invoiceId: string; offsetsDays: number[] }) =>
      configureScheduleAction({
        invoiceId: input.invoiceId as Id<"invoices">,
        offsetsDays: input.offsetsDays,
      }),
    [configureScheduleAction],
  );
  const sendNow = useCallback(
    (invoiceId: string) =>
      sendNowAction({ invoiceId: invoiceId as Id<"invoices"> }),
    [sendNowAction],
  );

  return {
    getSchedule,
    configureSchedule,
    sendNow,
  };
}
