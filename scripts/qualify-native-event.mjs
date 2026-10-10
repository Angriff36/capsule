/**
 * AC-168 / AC-103 qualification walk (PL-NATIVE-JOURNEY): ONE new native
 * event, taken from the client's quote request to finance's frozen closeout
 * in the real signed-in app, every handoff on the same event.
 *
 *   bun run --cwd <worktree> scripts/loop-browser-check.mjs scripts/qualify-native-event.mjs --no-push
 *
 * The client steps (quote form, acceptance link) run in a separate browser
 * with no sign-in. Staff steps run as the signed-in testing user. The walk
 * writes real rows to the LOCAL backend (one client, lead, event, proposal,
 * invoice, payment, delivery, time card, closeout per run, named
 * "Qualify Walk <stamp>"). Staff steps run once, at desktop width (the
 * phone pass records a skip); the client's pages run at phone width.
 *
 * Money: the payment is a check recorded by staff. No card processor, payment
 * link or reminder is touched (no live money, Ryan 2026-09-29).
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const squash = (s) => String(s ?? "").replace(/\s+/g, " ");

export default async function check({
  page,
  viewport,
  goto,
  shot,
  record,
  text,
}) {
  if (viewport.name !== "desktop") {
    record("phone width", true, "the walk runs once, at desktop width");
    return;
  }
  const stamp = Date.now();
  const client = `Qualify Walk ${stamp}`;
  const eventName = `${client} event`;
  const day = new Date(Date.now() + 40 * 864e5);
  const dayWords = `${MONTHS[day.getMonth()]} ${day.getDate()} ${day.getFullYear()}`;
  const dayIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const wait = (ms) => page.waitForTimeout(ms);
  const pageText = async () => squash(await text());
  const step = async (name, ok, detail) => {
    record(name, Boolean(ok), squash(detail).slice(0, 700));
    if (!ok) {
      await shot(`fail-${name.replace(/\W+/g, "-")}`);
      throw new Error(`step failed: ${name}`);
    }
  };
  const stageOf = async () => {
    const t = await pageText();
    const i = t.indexOf("All events");
    return t.slice(i + 11, i + 30);
  };

  await goto("/");
  const origin = new URL(page.url()).origin;
  const anonymous = await page
    .context()
    .browser()
    .newContext({
      // The client is on a phone (360px wide) and not signed in.
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
    });
  const clientPage = await anonymous.newPage();

  try {
    // 1. Client: the public quote form, not signed in.
    await clientPage.goto(`${origin}/quote`);
    await clientPage.waitForTimeout(3000);
    await clientPage.fill("#clientName", client);
    await clientPage.fill("#email", `qualify-${stamp}@example.com`);
    await clientPage.fill("#eventDate", dayWords);
    await clientPage.press("#eventDate", "Tab");
    await clientPage.fill("#eventStartTime", "17:00").catch(() => {});
    await clientPage.fill("#guestCount", "60");
    await clientPage.check('input[name="consent"]');
    await clientPage.click('button[type="submit"]');
    await clientPage.waitForTimeout(6000);
    await step(
      "client asks for a quote",
      squash(await clientPage.textContent("body")).includes("Submitted"),
      await clientPage.textContent("body"),
    );

    // 2. Sales: turn the request into a lead, event and draft proposal.
    await goto("/clients/quote-requests");
    await wait(3500);
    const request = page
      .locator("li, article, section, div", { hasText: client })
      .filter({ has: page.getByRole("button", { name: /convert to lead/i }) })
      .last();
    await request.getByRole("button", { name: /convert to lead/i }).click();
    await wait(5000);
    await step(
      "sales converts the request",
      (await pageText()).includes(`Converted “${client}”`),
      await pageText(),
    );

    // 3. Sales: menu, price, publish, share link (revoked link stays dead).
    await goto("/clients/proposals");
    await wait(3500);
    const proposal = page
      .locator("tr", { hasText: `Proposal for ${client}` })
      .first();
    await proposal.getByRole("button", { name: "Open" }).click();
    await wait(1500);
    const tools = page.locator('tr[id^="proposal-tools-"]').first();
    await tools.getByRole("button", { name: "Menu", exact: true }).click();
    await wait(2000);
    for (const dish of [
      "Add Herb Roasted Chicken Breast",
      "Add Garlic Roasted Red Potatoes",
    ]) {
      await page.getByRole("button", { name: dish }).first().click();
      await wait(2000);
    }
    await tools.getByRole("button", { name: "Hide menu" }).click();
    await tools.getByRole("button", { name: "Pricing", exact: true }).click();
    await wait(2000);
    await page.getByRole("button", { name: "Add line" }).click();
    await page
      .getByPlaceholder("Line description")
      .fill("Dinner buffet per guest");
    await page.getByLabel("Basis").selectOption("per_person");
    await page.getByLabel("Price / %").fill("42");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await wait(3000);
    await step(
      "sales prices the proposal (60 x $42 + 20% service)",
      (await proposal.innerText()).includes("$3,024.00"),
      await proposal.innerText(),
    );
    await tools.getByRole("button", { name: "Publish proposal" }).click();
    await wait(3000);
    await step(
      "sales publishes it",
      /Sent/.test(await proposal.innerText()),
      await proposal.innerText(),
    );

    await tools.getByRole("button", { name: /^Share link$/ }).click();
    await wait(3000);
    const shareUrl = (await pageText()).match(
      /https?:\/\/\S+\/share\/[A-Za-z0-9_-]+/,
    )?.[0];
    await step(
      "share link made",
      shareUrl,
      shareUrl ?? (await pageText()).slice(0, 400),
    );
    await clientPage.goto(shareUrl);
    await clientPage.waitForTimeout(3500);
    await step(
      "client reads the shared proposal",
      squash(await clientPage.textContent("body")).includes("$3,024.00"),
      await clientPage.textContent("body"),
    );
    await tools.getByRole("button", { name: "Revoke link" }).click();
    await wait(2500);
    // The confirm prompt has its own "Revoke link" button outside the row.
    const revokes = page.locator("button", { hasText: /^Revoke link$/i });
    const confirmAt = await revokes.evaluateAll((buttons) =>
      buttons.findIndex((b) => !b.closest('tr[id^="proposal-tools-"]')),
    );
    await revokes.nth(confirmAt).click();
    await wait(3000);
    await step(
      "sales revokes the link",
      (await pageText()).includes("Share link revoked"),
      await pageText(),
    );
    await clientPage.goto(shareUrl);
    await clientPage.waitForTimeout(3500);
    await step(
      "revoked share link shows no proposal",
      !squash(await clientPage.textContent("body")).includes("$3,024.00"),
      await clientPage.textContent("body"),
    );

    await tools.getByRole("button", { name: "Request signature" }).click();
    await wait(3000);
    const acceptUrl = (await pageText()).match(
      /https?:\/\/\S+\/accept\/[A-Za-z0-9_-]+/,
    )?.[0];
    await step("signature requested", acceptUrl, acceptUrl ?? "");

    // 4. Client: accept, then refresh.
    await clientPage.goto(acceptUrl);
    await clientPage.waitForTimeout(4000);
    await step(
      "client sees what they accept",
      squash(await clientPage.textContent("body")).includes("Accept Proposal"),
      await clientPage.textContent("body"),
    );
    await clientPage.getByRole("button", { name: "Accept Proposal" }).click();
    await clientPage.waitForTimeout(5000);
    await step(
      "client accepts",
      squash(await clientPage.textContent("body")).includes(
        "Proposal Accepted",
      ),
      await clientPage.textContent("body"),
    );
    await clientPage.reload();
    await clientPage.waitForTimeout(4000);
    await step(
      "after a refresh the client reads that they accepted",
      squash(await clientPage.textContent("body")).includes("You accepted"),
      await clientPage.textContent("body"),
    );

    // 5. The booked event: same client, dishes and price.
    await goto("/clients/proposals");
    await wait(3500);
    const accepted = page
      .locator("tr", { hasText: `Proposal for ${client}` })
      .first();
    const href = await accepted
      .getByRole("link", { name: "View event" })
      .getAttribute("href");
    const eventPath = href.split("?")[0];
    await goto(eventPath);
    await wait(4000);
    let t = await pageText();
    await step(
      "accepted proposal booked the event",
      t.includes(eventName) &&
        t.includes("2 MENU DISHES") &&
        t.includes("$3,024") &&
        t.includes("Revision 1 — signed digitally"),
      `${eventPath} ${t.slice(t.indexOf("All events"), t.indexOf("All events") + 500)}`,
    );

    // 6. Events team: staff the event; it moves to Approved by itself.
    await page.getByRole("button", { name: "Assign staff" }).first().click();
    await wait(2500);
    const roleSel = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "Bartender" }) })
      .first();
    const whoSel = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "Marco Delgado" }) })
      .first();
    for (const [role, who] of [
      ["Chef", "Marco Delgado"],
      ["Server", "Tessa Grant"],
      ["Driver", "Luis Ortega"],
    ]) {
      await roleSel.selectOption({ label: role });
      await whoSel.selectOption({ label: who });
      await page.getByRole("button", { name: /add to staff/i }).click();
      await wait(2500);
    }
    await goto(eventPath);
    await wait(4000);
    await step(
      "staffed event is approved",
      (await stageOf()).startsWith("APPROVED"),
      await stageOf(),
    );

    // 7. Sales: correct style, headcount (reviewed), venue; lock for sales.
    await page.getByRole("button", { name: "Edit event" }).click();
    await wait(2000);
    const style = page
      .locator('select[name="serviceStyleId"]')
      .filter({ visible: true })
      .first();
    await style.selectOption({ label: "Buffet – Bring Hot" });
    await style
      .locator("xpath=ancestor::form[1]")
      .getByRole("button", { name: "Save" })
      .click();
    await wait(2500);
    const venue = page.getByRole("combobox", { name: "Venue" });
    await venue.fill("Fields");
    await wait(1500);
    await page
      .getByRole("option", { name: "Fields Senior Living" })
      .first()
      .click();
    await venue
      .locator("xpath=ancestor::form[1]")
      .getByRole("button", { name: "Save" })
      .click();
    await wait(3000);
    const headcount = page
      .locator('input[name="headcount"]')
      .filter({ visible: true })
      .first();
    await headcount.fill("75");
    await headcount
      .locator("xpath=ancestor::form[1]")
      .getByRole("button", { name: "Save" })
      .click();
    await wait(3000);
    await page.getByRole("button", { name: /confirm and apply/i }).click();
    await wait(3500);
    await page.keyboard.press("Escape");
    await goto(eventPath);
    await wait(3500);
    t = await pageText();
    await step(
      "sales corrections saved",
      t.includes("75 guests") &&
        t.includes("Buffet – Bring Hot") &&
        t.includes("Fields Senior Living"),
      t.slice(t.indexOf("All events"), t.indexOf("All events") + 400),
    );
    await page.getByRole("button", { name: "Stage actions" }).click();
    await wait(1000);
    await page
      .getByRole("button", { name: "Lock for sales" })
      .filter({ visible: true })
      .first()
      .click();
    await wait(4000);
    await goto(eventPath);
    await wait(3500);
    t = await pageText();
    await step(
      "sales locks the event; prep followed the headcount",
      (await stageOf()).startsWith("SALES LOCK") && t.includes("Prep finished"),
      t.slice(t.indexOf("All events"), t.indexOf("All events") + 600),
    );

    // 8. Kitchen: claim, start and complete every prep step of this event.
    await goto(`/kitchen/prep?from=${dayIso}`);
    await wait(5000);
    const action = /^(Claim|Start|Complete)$/;
    let clicks = 0;
    for (; clicks < 20; clicks++) {
      const next = page
        .getByRole("button", { name: action })
        .filter({ visible: true })
        .first();
      if (!(await next.count())) break;
      await next.click({ timeout: 8000 });
      await wait(2200);
    }
    await goto(eventPath);
    await wait(3500);
    t = await pageText();
    await step(
      "kitchen finishes prep",
      t.includes("No prep left open"),
      `${clicks} clicks; ${t.slice(t.indexOf("BEFORE EXECUTING"), t.indexOf("BEFORE EXECUTING") + 200)}`,
    );

    // 9. Warehouse: pack every line, mark packed, then loaded.
    await page
      .getByRole("button", { name: "Open pack list" })
      .filter({ visible: true })
      .first()
      .click();
    await wait(4000);
    for (let i = 0; i < 10; i++) {
      const mark = page
        .getByRole("button", { name: /^mark packed$/i })
        .filter({ visible: true })
        .first();
      if (!(await mark.count())) break;
      const line = mark.locator("xpath=ancestor::tr[1]");
      const required =
        squash(await line.innerText()).match(/(\d+(?:\.\d+)?) each/)?.[1] ??
        "1";
      await mark.dispatchEvent("click");
      await wait(1500);
      await page.getByLabel("Total packed so far").fill(required);
      await page
        .getByRole("button", { name: /save packed quantity/i })
        .dispatchEvent("click");
      await wait(2500);
    }
    t = await pageText();
    await step(
      "warehouse packs every line",
      t.includes(eventName) && !t.includes("Still to pack"),
      t.slice(t.indexOf("LOAD SHEET"), t.indexOf("LOAD SHEET") + 300),
    );
    await page
      .getByRole("button", { name: /mark list packed/i })
      .dispatchEvent("click");
    await wait(3000);
    await page
      .getByRole("button", { name: /mark loaded/i })
      .dispatchEvent("click");
    await wait(3000);
    t = await pageText();
    await step(
      "pack list loaded",
      t.includes("Pack list marked loaded"),
      t.slice(t.indexOf("LOAD SHEET"), t.indexOf("LOAD SHEET") + 200),
    );

    // 10. Driver: schedule, drive, hand over.
    await goto("/logistics/deliveries");
    await wait(4000);
    await page
      .getByRole("button", { name: /schedule delivery/i })
      .filter({ visible: true })
      .first()
      .dispatchEvent("click");
    await wait(2000);
    const run = page
      .locator("main form")
      .filter({ has: page.locator('select[name="packListId"]') });
    const packValue = await run
      .locator('select[name="packListId"] option', { hasText: eventName })
      .first()
      .getAttribute("value");
    await run.locator('select[name="packListId"]').selectOption(packValue);
    await wait(800);
    const destination = run.locator('input[name="destination"]');
    if (!(await destination.inputValue()))
      await destination.fill("Fields Senior Living");
    const when = run.locator(
      'input[type="text"][placeholder="e.g. next Friday 6pm"]',
    );
    await when.nth(0).fill(`${dayWords} 3pm`);
    await when.nth(0).press("Tab");
    await when.nth(1).fill(`${dayWords} 4:30pm`);
    await when.nth(1).press("Tab");
    await run
      .locator('select[name="driverId"]')
      .selectOption({ label: "Luis Ortega" });
    await run.getByRole("button", { name: "Schedule", exact: true }).click();
    await wait(3500);
    const delivery = () => page.locator("tr", { hasText: eventName }).first();
    await delivery()
      .locator("button", { hasText: /^start transit$/i })
      .dispatchEvent("click");
    await wait(3000);
    await delivery()
      .locator("button", { hasText: /^confirm delivery$/i })
      .dispatchEvent("click");
    await wait(2500);
    await page
      .locator('input[name="receivedBy"]')
      .fill("Front desk, Fields Senior Living");
    await page
      .locator("form, div", { has: page.locator('input[name="receivedBy"]') })
      .filter({ has: page.getByRole("button", { name: /keep as-is/i }) })
      .last()
      .getByRole("button", { name: /confirm delivery/i })
      .dispatchEvent("click");
    await wait(3500);
    await goto(eventPath);
    await wait(3500);
    t = await pageText();
    await step(
      "delivery arrived",
      t.includes("No delivery still on the way") &&
        t.includes("No pack list left to pack"),
      t.slice(
        t.indexOf("BEFORE EXECUTING"),
        t.indexOf("BEFORE EXECUTING") + 250,
      ),
    );

    // 11. Event day: start the event.
    await page
      .locator("button", { hasText: "Start the event" })
      .first()
      .dispatchEvent("click");
    await wait(3500);
    await step(
      "event started",
      (await stageOf()).startsWith("EXECUTING"),
      await stageOf(),
    );

    // 12. Staff time: a worked shift on this event, approved by a manager.
    await goto("/staff/time");
    await wait(3500);
    await page
      .getByRole("button", { name: /^clock in$/i })
      .filter({ visible: true })
      .first()
      .dispatchEvent("click");
    await wait(2000);
    const card = page
      .locator("main form")
      .filter({ has: page.locator('select[name="personId"]') })
      .first();
    await card
      .locator('select[name="personId"]')
      .selectOption({ label: "Marco Delgado" });
    const eventValue = await card
      .locator('select[name="eventId"] option', { hasText: eventName })
      .first()
      .getAttribute("value");
    await card.locator('select[name="eventId"]').selectOption(eventValue);
    const clockIn = card.getByLabel("Clock in", { exact: true });
    await clockIn.fill("yesterday 8am");
    await clockIn.press("Tab");
    const clockOut = card.getByLabel("Clock out", { exact: true });
    await clockOut.fill("yesterday 10:30am");
    await clockOut.press("Tab");
    await card.locator('button[type="submit"]').first().click();
    await wait(3500);
    const timeRow = page
      .locator("tr", { hasText: eventName })
      .filter({ hasText: "Marco Delgado" })
      .first();
    await timeRow
      .getByRole("button", { name: /approve/i })
      .dispatchEvent("click");
    await wait(2500);
    await step(
      "crew time recorded and approved",
      /2\.5 h/.test(await timeRow.innerText()) &&
        /Approved/.test(await timeRow.innerText()),
      await timeRow.innerText(),
    );

    // 13. Finish the event.
    for (const [label, stage] of [
      ["Finalize event", "FINAL"],
      ["Complete", "COMPLETED"],
    ]) {
      await goto(eventPath);
      await wait(3500);
      await page
        .locator("button", { hasText: new RegExp(`^${label}$`) })
        .first()
        .dispatchEvent("click");
      await wait(3500);
      await step(
        `event ${stage.toLowerCase()}`,
        (await stageOf()).startsWith(stage),
        await stageOf(),
      );
    }

    // 14. Finance: send the invoice, record and settle the client's check.
    await goto("/finance/invoices");
    await wait(4000);
    const invoice = page.locator("tr", { hasText: client }).first();
    const invoiceNumber =
      squash(await invoice.innerText()).match(/INV-\d+/)?.[0] ?? "";
    await invoice
      .locator("button", { hasText: /^mark sent$/i })
      .dispatchEvent("click");
    await wait(3000);
    await invoice
      .locator("a, button", { hasText: /^open$/i })
      .first()
      .click();
    await wait(4000);
    const invoicePath = new URL(page.url()).pathname;
    await page
      .locator("a, button", { hasText: /^\s*add payment\s*$/i })
      .first()
      .click();
    await wait(4000);
    const pay = page
      .locator("form")
      .filter({ has: page.locator('select[name="invoiceId"]') })
      .first();
    await pay.locator('input[name="amount"]').fill("3024");
    await pay.locator('select[name="method"]').selectOption({ label: "Check" });
    await pay
      .locator('textarea[name="notes"]')
      .fill("Check 1042 from the client");
    await pay.locator('button[type="submit"]').first().click();
    await wait(3500);
    await page
      .locator("tr", { hasText: invoiceNumber })
      .first()
      .locator("button", { hasText: /^settle$/i })
      .dispatchEvent("click");
    await wait(3000);
    await goto(invoicePath);
    await wait(3500);
    t = await pageText();
    await step(
      `invoice ${invoiceNumber} paid in full`,
      t.includes("PAID $3,024.00") && t.includes("Amount due $0.00"),
      t.slice(t.indexOf("TOTAL $") - 80, t.indexOf("TOTAL $") + 80),
    );

    // 15. Close out the event.
    await goto(eventPath);
    await wait(3500);
    await page
      .locator("button", { hasText: /^Close out$/ })
      .first()
      .dispatchEvent("click");
    await wait(2500);
    await page
      .locator("button", { hasText: /close out event/i })
      .last()
      .dispatchEvent("click");
    await wait(3500);
    await step(
      "event closed out",
      (await stageOf()).startsWith("CLOSED OUT"),
      await stageOf(),
    );

    // 16. Finance: reconcile from the records, add the food bill, finalize.
    await goto("/finance/closeout");
    await wait(4000);
    const folio = () =>
      page.locator("tr", { hasText: new RegExp(eventName, "i") }).first();
    await folio()
      .locator("button", { hasText: /^reconcile$/i })
      .first()
      .dispatchEvent("click");
    await wait(2500);
    const capture = page.locator("main form").first();
    const sources = squash(await capture.innerText());
    await step(
      "closeout reads the event's own records",
      sources.includes("Revenue 1 record $3,024.00") &&
        /Staff time 1 record — \$\d/.test(sources) &&
        sources.includes("Received $3,024.00"),
      sources,
    );
    await capture.locator('input[name="entered.ingredient"]').fill("640");
    await capture.locator('button[type="submit"]').click();
    await wait(3500);
    await folio()
      .locator("button", { hasText: /^finalize$/i })
      .first()
      .dispatchEvent("click");
    await wait(3500);
    await page
      .locator("button", { hasText: /show finalized/i })
      .first()
      .dispatchEvent("click");
    await wait(2500);
    await step(
      "closeout finalized",
      /Finalized/.test(await folio().innerText()) &&
        /75\/75/.test(await folio().innerText()),
      await folio().innerText(),
    );
    await shot("closeout-finalized");

    // 17. Management: the event's money view reconciles the same records.
    await goto(`${eventPath}?tab=margin`);
    await wait(5000);
    t = await pageText();
    await step(
      "management sees revenue, clocked labor and actual food cost",
      t.includes("TOTAL REVENUE $3,024") &&
        t.includes("2.5 clocked hours") &&
        t.includes("Actual (purchases + recorded waste) $640"),
      t.slice(t.indexOf("Margin"), t.indexOf("Margin") + 900),
    );
    await shot("money");
    record(
      "same event",
      true,
      `${eventName} ${eventPath} invoice ${invoiceNumber}`,
    );
  } finally {
    await anonymous.close();
  }
}
