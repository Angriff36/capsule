// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  command,
  container,
  field,
  input,
  mount,
  submit,
} from "./support/mounted-app";
import { QuoteSubmissionPage } from "../src/features/sales/QuoteSubmissionPage";

it("submits entered start and end times as distinct local timestamps", async () => {
  backend.values.set("quoteBuilder:getQuoteFormOptions", {
    serviceStyles: [],
    occasions: [],
    available: true,
  });
  const send = command("quoteBuilder:submitQuote", {
    submissionId: "quote-1",
    message: "Request received",
  });
  await mount(createElement(QuoteSubmissionPage));
  input("clientName", "Pat Client");
  input("email", "pat@example.com");
  input("eventDate", "2099-10-12");
  input("eventStartTime", "17:30");
  input("eventEndTime", "22:15");
  input("guestCount", "40");
  (field("consent") as HTMLInputElement).checked = true;
  await submit(field("clientName").closest("form")!);
  expect(send).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      clientName: "Pat Client",
      email: "pat@example.com",
      guestCount: 40,
      consent: true,
      eventDate: new Date(2099, 9, 12, 17, 30).getTime(),
      eventEndTime: new Date(2099, 9, 12, 22, 15).getTime(),
    }),
  );
  expect(container.textContent).toContain("Request received");
});
