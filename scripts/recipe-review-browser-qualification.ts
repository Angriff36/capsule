/**
 * RR-5 / AC-046 — runnable browser acceptance procedure for the component
 * import review workbench (specs/ralph/production-03-recipe-truth.md PR03-01/08
 * + production-14-qualification-cutover.md PR14-03/04/05/07, recipe delivery
 * portion).
 *
 * Why this exists: the jsdom tests in tests/features/kitchen/component-import-
 * review.test.ts prove wiring, but PR14-04/05 demand the real authenticated
 * route in a real browser at desktop and 360 CSS-px with keyboard input and
 * denied access exercised. This script drives the actual UI against the actual
 * local backend and records dated, reproducible evidence.
 *
 * Environment expected (see codex-plans/production-readiness-next/
 * recipe-review-verification.md for the full bring-up):
 *   - Vite preview of THIS checkout running at RR5_BASE_URL (default
 *     http://127.0.0.1:7813) with VITE_CONVEX_URL pointing at a local Convex
 *     backend that has this branch's functions and the fixture workspace
 *     (admin Person pre-linked to the Clerk user below, priced ingredients
 *     "Heavy Cream" and "Garlic").
 *   - A Chromium-based browser on the machine (uses the installed Google
 *     Chrome through playwright-core's "chrome" channel).
 *   - playwright-core importable from the directory you run this from, e.g.
 *       mkdir -p .artifacts/rr5/pw && cd .artifacts/rr5/pw
 *       echo '{"name":"rr5-qualification","private":true}' > package.json
 *       bun add playwright-core
 *       cp ../../../scripts/recipe-review-browser-qualification.ts qualify.ts
 *       RR5_SHOT_DIR=../shots bun qualify.ts
 *     (a scratch install — the repository takes no new dependency, and this
 *     script is intentionally NOT part of `bun run check`).
 *
 * Output: screenshots in RR5_SHOT_DIR (default
 * .artifacts/recipe-review-qualification) and a results JSON beside them.
 * Exit code 1 when any step FAILs — results are honest, never faked.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.RR5_BASE_URL ?? "http://127.0.0.1:7813";
const EMAIL = process.env.RR5_EMAIL ?? "ralph.rr5.20260906@example.com";
const PASSWORD = process.env.RR5_PASSWORD ?? "Ralph-RR5-qualify-2026!";
const IMPORT_ROUTE = `${BASE}/kitchen/components/import`;
const SHOT_DIR = resolve(
  process.env.RR5_SHOT_DIR ?? ".artifacts/recipe-review-qualification",
);
const RESULTS_PATH = resolve(SHOT_DIR, "results.json");
const FIXTURES = resolve(
  process.env.RR5_FIXTURE_DIR ?? ".artifacts/rr5/fixtures",
);

const PASTE_TEXT = `House Huckleberry Cream Base

1 1/2 cup Heavy Cream
2 pinches smoked salt
Salt to taste
0.5 kilogram Huckleberry Compote
1. Warm the cream gently.
2. Fold the compote through.`;

const CONFLICT_TEXT = `House Conflict Custard

2 cup Heavy Cream
1 pinch saffron
salt to taste`;

interface StepResult {
  step: number;
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
  shot?: string;
}
const results: StepResult[] = [];
let stepCounter = 0;

function record(
  name: string,
  ok: boolean,
  detail: string,
  shot?: string,
): boolean {
  results.push({
    step: ++stepCounter,
    name,
    status: ok ? "PASS" : "FAIL",
    detail,
    shot,
  });
  console.log(`${ok ? "PASS" : "FAIL"} ${stepCounter}. ${name} — ${detail}`);
  return ok;
}

async function main(): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const { chromium } = await import("playwright-core");
  // RR5_EXECUTABLE points at a Chromium binary when the playwright-core
  // version's own browser revision is not installed and channel:"chrome"
  // cannot be used (e.g. system Chrome hangs under CDP in this environment).
  const browser = await chromium.launch(
    process.env.RR5_EXECUTABLE
      ? { executablePath: process.env.RR5_EXECUTABLE, headless: true }
      : { channel: "chrome", headless: true },
  );
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const shot = async (name: string): Promise<string> => {
    const file = resolve(SHOT_DIR, name);
    await page
      .screenshot({ path: file, fullPage: true })
      .catch(() => undefined);
    return name;
  };
  const bodyText = async (): Promise<string> =>
    page.evaluate(() => document.body.innerText);
  const has = async (text: string): Promise<boolean> =>
    (await bodyText()).includes(text);

  // ---- Clerk sign-in (this instance renders an in-page single-step form;
  // ---- kept frame-tolerant in case the instance switches to hosted UI) ----
  async function frameWith(selector: string) {
    for (const frame of page.frames()) {
      if ((await frame.locator(selector).count()) > 0) return frame;
    }
    return null;
  }
  async function signInVisible(): Promise<boolean> {
    if (await frameWith('input[type="password"]')) return true;
    return (await bodyText()).includes("Sign in to Capsule");
  }
  async function clerkSignIn(): Promise<string> {
    // Preferred path: the product's own staff sign-in ticket (convex/lib/
    // clerkSignInTicket.ts) — exactly what a manager's invite email carries.
    // RR5_TICKET is minted with the dev-instance CLERK_SECRET_KEY via
    //   POST https://api.clerk.com/v1/sign_in_tokens {user_id}
    const ticket = process.env.RR5_TICKET;
    if (ticket) {
      await page.goto(`${BASE}/?__clerk_ticket=${ticket}`, {
        waitUntil: "domcontentloaded",
      });
      // clerk-js processes the ticket asynchronously; the sign-in screen can
      // flash (or blank out) mid-redirect, so only trust a sign-in-free page
      // after it has stayed that way for several consecutive seconds.
      let consecutive = 0;
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        consecutive = (await signInVisible()) ? 0 : consecutive + 1;
        if (consecutive >= 5) return "signed in via one-time ticket";
      }
      return "ticket did not complete sign-in";
    }
    // Fallback: interactive password sign-in. Note this dev instance asks a
    // fresh browser for an emailed new-device verification code after the
    // password step — a human reads that email; an unattended run should use
    // the ticket path above.
    const email = page
      .getByRole("textbox", { name: /email address or username/i })
      .first();
    for (let i = 0; i < 10; i++) {
      if (await email.isVisible().catch(() => false)) break;
      await page.waitForTimeout(1000);
    }
    if (!(await email.isVisible().catch(() => false))) {
      return "email field never appeared";
    }
    await email.fill(EMAIL);
    await page
      .getByRole("button", { name: /continue/i })
      .first()
      .click();
    const password = page.locator('input[type="password"]').first();
    for (let i = 0; i < 10; i++) {
      if (await password.isVisible().catch(() => false)) break;
      await page.waitForTimeout(1000);
    }
    if (!(await password.isVisible().catch(() => false))) {
      return "password field never appeared after continue";
    }
    await password.fill(PASSWORD);
    await password.press("Enter");
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      if (!(await signInVisible())) return "signed in";
    }
    return "still on sign-in after submit";
  }

  // ---- workbench helpers (same-origin React DOM) ----
  const reviewPane = page.locator('[aria-label="Structured review"]');
  const finalizeButton = page.getByRole("button", {
    name: "Save and edit component",
  });
  const saveButton = page.getByRole("button", {
    name: /Save review|Retry save/,
  });
  /** Line <li> whose Ingredient input VALUE contains `substr` (case-insensitive) —
   *  hasText cannot see input values, and parsed names are title-cased. */
  const lineByValue = async (substr: string) => {
    for (let round = 0; round < 4; round++) {
      const lis = page.locator("li[data-unresolved]");
      const count = await lis.count();
      for (let i = 0; i < count; i++) {
        const li = lis.nth(i);
        const value = await li
          .locator("input")
          .first()
          .inputValue()
          .catch(() => "");
        if (value.toLowerCase().includes(substr.toLowerCase())) return li;
      }
      // React re-renders can detach rows mid-read; retry once settled.
      await page.waitForTimeout(600);
    }
    return null;
  };

  /** Click every line's confirm/accept button (inside its own <li>) until the
   *  unresolved-matches block is gone; returns remaining unresolved count. */
  const resolveAllMatches = async (): Promise<number> => {
    for (let round = 0; round < 5; round++) {
      const lis = page.locator("li[data-unresolved]");
      const count = await lis.count();
      for (let i = 0; i < count; i++) {
        const li = lis.nth(i);
        const btn = li
          .getByRole("button", {
            name: /Accept exact match|Confirm new ingredient|Confirm create/,
          })
          .first();
        if ((await btn.count()) > 0) await btn.click().catch(() => undefined);
      }
      await page.waitForTimeout(600);
      const blockText = (
        await page.locator(".component-import-unresolved").allInnerTexts()
      ).join(" ");
      const match = blockText.match(/(\d+) ingredient lines still need review/);
      if (!match) return 0;
    }
    const blockText = (
      await page.locator(".component-import-unresolved").allInnerTexts()
    ).join(" ");
    const match = blockText.match(/(\d+) ingredient lines still need review/);
    return match ? Number(match[1]) : 0;
  };

  /** Finalize lands on /kitchen/components/<id> — never the /import route. */
  const waitForComponentUrl = async (): Promise<string> => {
    for (let i = 0; i < 20; i++) {
      const match = page
        .url()
        .match(/\/kitchen\/components\/(?!import\b)([^/?#]+)/);
      if (match) return match[1] ?? "";
      await page.waitForTimeout(1000);
    }
    return "";
  };

  async function gotoImport(url = IMPORT_ROUTE): Promise<void> {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Vite dev serves unbundled modules — a cold first load takes a while.
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      if ((await bodyText()).includes("Component import")) return;
      if (await signInVisible()) return;
    }
  }

  // ============ PHASE A — desktop ============
  await gotoImport();
  const signedOutDenied = await signInVisible();
  const workbenchHidden = !(await has("Saved reviews in progress"));
  record(
    "A1 denied when signed out",
    signedOutDenied && workbenchHidden,
    signedOutDenied
      ? "sign-in screen shown; import workbench not rendered"
      : "no sign-in screen detected",
    await shot("01-signedout-denied.png"),
  );

  const signInOutcome = await clerkSignIn();
  await gotoImport();
  record(
    "A2 authenticated sign-in",
    (await has("Component import")) && !(await signInVisible()),
    `${signInOutcome}; import route reached`,
    await shot("02-after-signin.png"),
  );

  const emptyListSentence = await has("No saved reviews in progress.");
  const resumeRows =
    (await page.getByRole("link", { name: "Resume" }).count()) > 0;
  record(
    "A3 saved-reviews section renders (empty on a fresh workspace)",
    (emptyListSentence || resumeRows) &&
      (await has("Saved reviews in progress")),
    emptyListSentence
      ? "fresh workspace: empty state sentence shown"
      : `workspace already has saved reviews: ${resumeRows ? "resume rows listed" : "no rows"}`,
    await shot("03-empty-list.png"),
  );

  await page.locator("#component-import-source").fill(PASTE_TEXT);
  await shot("04-paste-input.png");
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await page
    .locator("li[data-unresolved]")
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(600);
  const issueBlocks = await page
    .locator(".component-import-unresolved")
    .allInnerTexts();
  const finalizeDisabled = !(await finalizeButton.isEnabled());
  record(
    "A4 parse surfaces honest issues",
    issueBlocks.length > 0 && finalizeDisabled,
    `issue blocks: ${JSON.stringify(issueBlocks)}; finalize disabled=${finalizeDisabled}`,
    await shot("05-parse-issues.png"),
  );

  // Corrections. Field values are entered with keyboard events; the pane's
  // action buttons are activated by click (recorded honestly).
  await reviewPane
    .locator(".component-import-yield input[type='number']")
    .fill("12");
  await reviewPane
    .locator(".component-import-yield select")
    .selectOption("portion");
  (await lineByValue("smoked salt"))!
    .locator("select")
    .last()
    .selectOption("teaspoon");
  const saltLine = await lineByValue("salt");
  await saltLine.locator("input[type='number']").fill("1");
  await saltLine.locator("select").selectOption("each");
  await resolveAllMatches();
  await page.waitForTimeout(400);
  const issuesAfter = await page
    .locator(".component-import-unresolved")
    .count();
  const finalizeEnabled = await finalizeButton.isEnabled();
  record(
    "A5 corrections clear issues",
    issuesAfter === 0 && finalizeEnabled,
    `issue blocks remaining=${issuesAfter}; finalize enabled=${finalizeEnabled}`,
    await shot("06-corrections-done.png"),
  );

  await saveButton.click();
  for (let i = 0; i < 8; i++) {
    const statusText = await page
      .locator(".component-import-save-state")
      .innerText()
      .catch(() => "");
    if (statusText.includes("Saved")) break;
    await page.waitForTimeout(1000);
  }
  const importUrl = page.url();
  const importId1 = new URL(importUrl).searchParams.get("importId") ?? "";
  const savedState = (
    await page
      .locator(".component-import-save-state")
      .innerText()
      .catch(() => "")
  ).includes("Saved");
  record(
    "A6 durable save with importId",
    savedState && importId1.length > 0,
    `save status span says Saved=${savedState}; importId=${importId1 || "(none)"}`,
    await shot("07-saved.png"),
  );

  const sourcePanelOk =
    (await has("Original source")) &&
    (await has("Corrections never change this text.")) &&
    (await has("1 1/2 cup Heavy Cream"));
  record(
    "A7 read-only original source panel",
    sourcePanelOk,
    sourcePanelOk
      ? "panel shows raw paste incl. uncorrected '1 1/2 cup Heavy Cream'"
      : "source panel or raw text missing",
    await shot("08-source-panel.png"),
  );

  await page.reload();
  await page.waitForTimeout(1800);
  const yieldAfterReload = await reviewPane
    .locator(".component-import-yield input[type='number']")
    .inputValue()
    .catch(() => "");
  const reloadOk =
    yieldAfterReload === "12" &&
    (await has("Original source")) &&
    (await has("teaspoon"));
  record(
    "A8 reload keeps corrections and source",
    reloadOk,
    `yield=${yieldAfterReload}; source panel=${await has("Original source")}`,
    await shot("09-reload-persist.png"),
  );

  await finalizeButton.click();
  const componentId1 = await waitForComponentUrl();
  record(
    "A9 finalize navigates to component",
    componentId1.length > 0,
    `component id=${componentId1 || "(no navigation away from import route)"}`,
    await shot("10-finalize-nav.png"),
  );

  const onDetail = /\/kitchen\/components\/(?!import\b)/.test(page.url());
  const detailSource =
    onDetail &&
    (await has("Original source")) &&
    (await has("House Huckleberry Cream Base"));
  record(
    "A10 component detail shows original source",
    detailSource,
    detailSource
      ? "raw source readable on the component detail page"
      : `detail page not reached (url=${page.url().slice(0, 80)}) or source panel missing`,
    await shot("11-component-source.png"),
  );
  const costPanelText = await page
    .locator('[data-testid="component-cost-panel"]')
    .innerText()
    .catch(() => "");
  const missingPriceLines =
    costPanelText.match(/[^\n]*needs a current cost[^\n]*/g) ?? [];
  const coverage = await page
    .locator('[data-testid="component-pricing-coverage"]')
    .innerText()
    .catch(() => "");
  record(
    "A11 missing price stays incomplete cost",
    missingPriceLines.length > 0 && /\d+\s*\/\s*\d+/.test(coverage),
    `coverage=${coverage}; gap lines: ${JSON.stringify(missingPriceLines)}`,
    await shot("12-cost-coverage.png"),
  );

  // ============ PHASE B — 360px mobile CSV ============
  await page.setViewportSize({ width: 360, height: 740 });
  await gotoImport();
  const mobileTabs =
    (await page.getByRole("tab", { name: "Source" }).count()) > 0 &&
    (await page.getByRole("tab", { name: "Review" }).count()) > 0;
  record(
    "B1 mobile tabs at 360px",
    mobileTabs,
    mobileTabs ? "Source/Review tabs rendered" : "mobile tabs missing",
  );

  await page.getByRole("tab", { name: "Files" }).click();
  const fileInputs = page.locator(".component-import-files input[type='file']");
  await fileInputs.nth(0).setInputFiles(resolve(FIXTURES, "rr5-sheet.csv"));
  await fileInputs.nth(1).setInputFiles(resolve(FIXTURES, "rr5-lines.csv"));
  await shot("13-csv-input-360.png");
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await page
    .locator("li[data-unresolved]")
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(600);
  const csvIssues = await page
    .locator(".component-import-unresolved")
    .allInnerTexts();
  record(
    "B2 CSV pair parses with honest gaps",
    csvIssues.length > 0,
    `issue blocks: ${JSON.stringify(csvIssues)}`,
  );

  await reviewPane
    .locator(".component-import-yield input[type='number']")
    .fill("8");
  await reviewPane
    .locator(".component-import-yield select")
    .selectOption("portion");
  (await lineByValue("smoked salt"))!
    .locator("select")
    .last()
    .selectOption("teaspoon");
  (await lineByValue("whipped huckleberry"))!
    .locator("select")
    .last()
    .selectOption("liter");
  await resolveAllMatches();
  await page.waitForTimeout(400);
  await shot("14-csv-review-360.png");
  await saveButton.click();
  let csvSaved = false;
  for (let i = 0; i < 8; i++) {
    const statusText = await page
      .locator(".component-import-save-state")
      .innerText()
      .catch(() => "");
    if (statusText.includes("Saved")) {
      csvSaved = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  const importId2 = new URL(page.url()).searchParams.get("importId") ?? "";
  await page.getByRole("tab", { name: "Source" }).click();
  await page.waitForTimeout(400);
  const csvPanels =
    (await has("Sheet CSV (stored separately)")) &&
    (await has("Lines CSV (stored separately)")) &&
    (await has("component_name,source_order,source_line"));
  record(
    "B3 CSV save + separately stored source",
    csvSaved && importId2.length > 0 && csvPanels,
    `saved=${csvSaved}; importId=${importId2}; sheet/lines CSV blocks=${csvPanels}`,
    await shot("15-csv-source-panel-360.png"),
  );

  await page.getByRole("tab", { name: "Review" }).click();
  await finalizeButton.click();
  const componentId2 = await waitForComponentUrl();
  const mobileDetail =
    (await has("Original source")) && (await has("needs a current cost"));
  record(
    "B4 CSV finalize at 360px with cost gap",
    componentId2.length > 0 && mobileDetail,
    `component id=${componentId2}; detail source=${await has("Original source")}; unpriced gap shown=${await has("needs a current cost")}`,
    await shot("16-csv-component-detail-360.png"),
  );

  // ============ PHASE C — concurrent-edit conflict ============
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoImport();
  await page.locator("#component-import-source").fill(CONFLICT_TEXT);
  await page.getByRole("button", { name: "Parse", exact: true }).click();
  await page
    .locator("li[data-unresolved]")
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(600);
  await reviewPane
    .locator(".component-import-yield input[type='number']")
    .fill("6");
  await reviewPane
    .locator(".component-import-yield select")
    .selectOption("pint");
  (await lineByValue("saffron"))!
    .locator("select")
    .last()
    .selectOption("teaspoon");
  // "salt to taste" is honestly classified as a prep note, not an ingredient
  // line, so there is no salt row to correct — the measurement gaps to fix
  // here are the yield and the unknown "pinch" unit only.
  await resolveAllMatches();
  await saveButton.click();
  let c1Saved = false;
  for (let i = 0; i < 8; i++) {
    const statusText = await page
      .locator(".component-import-save-state")
      .innerText()
      .catch(() => "");
    if (statusText.includes("Saved")) {
      c1Saved = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  const importId3 = new URL(page.url()).searchParams.get("importId") ?? "";
  record(
    "C1 third import saved",
    importId3.length > 0 && c1Saved,
    `saved=${c1Saved}; importId=${importId3}`,
  );

  // Dirty tab 1 FIRST, or its clean editor silently adopts tab 2's newer
  // revision and no conflict ever happens (that adoption is itself the
  // designed non-destructive behavior for clean tabs).
  const creamLine = await lineByValue("heavy cream");
  await creamLine.locator("input[type='number']").first().fill("2.5");

  const tab2 = await context.newPage();
  await tab2.goto(`${IMPORT_ROUTE}?importId=${importId3}`);
  await tab2.waitForTimeout(2000);
  const t2Pane = tab2.locator('[aria-label="Structured review"]');
  await t2Pane
    .locator(".component-import-yield input[type='number']")
    .fill("8");
  await tab2.getByRole("button", { name: /Save review|Retry save/ }).click();
  let t2Saved = false;
  for (let i = 0; i < 8; i++) {
    const statusText = await tab2
      .locator(".component-import-save-state")
      .innerText()
      .catch(() => "");
    if (statusText.includes("Saved")) {
      t2Saved = true;
      break;
    }
    await tab2.waitForTimeout(1000);
  }
  record(
    "C2 second tab saves newer revision",
    t2Saved,
    `tab 2 yield=8 saved=${t2Saved}`,
    await shot("17-conflict-tab2-saved.png"),
  );

  // Give tab 1's reactive layer a moment to see the newer saved revision,
  // then save the dirty local edits against it.
  await page.waitForTimeout(1500);
  await saveButton.click();
  await page.waitForTimeout(2500);
  const conflictShown = await has(
    "Saved by someone else — your edits are kept.",
  );
  const localEditKept =
    (await creamLine.locator("input[type='number']").first().inputValue()) ===
    "2.5";
  const reloadOffered =
    (await page.getByRole("button", { name: "Reload saved version" }).count()) >
    0;
  record(
    "C3 stale revision keeps local edits",
    conflictShown && localEditKept && reloadOffered,
    `conflict notice=${conflictShown}; local qty kept=${localEditKept}; reload button=${reloadOffered}`,
    await shot("18-conflict-tab1-blocked.png"),
  );

  await page.getByRole("button", { name: "Reload saved version" }).click();
  await page.waitForTimeout(800);
  const adoptedQty = await creamLine
    .locator("input[type='number']")
    .first()
    .inputValue();
  const adoptedYield = await reviewPane
    .locator(".component-import-yield input[type='number']")
    .inputValue();
  record(
    "C4 reload adopts stored version",
    adoptedQty === "2" && adoptedYield === "8",
    `qty=${adoptedQty}; yield=${adoptedYield}`,
    await shot("19-reload-saved-adopted.png"),
  );

  // ============ PHASE D — lost finalization acknowledgement ============
  // Click finalize, let the request DISPATCH, then navigate away before the
  // acknowledgement can render — the server must still complete the import.
  void finalizeButton.click().catch(() => undefined);
  await page.waitForTimeout(1500);
  await tab2.close().catch(() => undefined);
  await page
    .goto(`${IMPORT_ROUTE}?importId=${importId3}`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    })
    .catch(() => undefined);
  let completedShown = false;
  for (let i = 0; i < 12 && !completedShown; i++) {
    await page.waitForTimeout(1500);
    completedShown = await has("This import is complete.");
    if (i === 5 && !completedShown) {
      await page
        .reload({ waitUntil: "domcontentloaded", timeout: 20000 })
        .catch(() => undefined);
    }
  }
  const openComponentOffered =
    (await page.getByRole("link", { name: "Open component" }).count()) > 0;
  record(
    "D1 finalize survives interrupted acknowledgement",
    completedShown && openComponentOffered,
    `completed state=${completedShown}; open component link=${openComponentOffered}`,
    await shot("20-lost-ack-completed.png"),
  );

  // ============ PHASE E — denied access when signed out ============
  await page
    .evaluate(() =>
      (
        window as unknown as { Clerk?: { signOut: () => Promise<void> } }
      ).Clerk?.signOut(),
    )
    .catch(() => undefined);
  await context.clearCookies();
  await page
    .goto(`${IMPORT_ROUTE}?importId=${importId1}`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(4000);
  const signedOutAgain = await signInVisible();
  const noLeak = !(await has("House Huckleberry Cream Base"));
  record(
    "E1 saved import denied when signed out",
    signedOutAgain && noLeak,
    `sign-in shown=${signedOutAgain}; source text leaked=${!noLeak}`,
    await shot("21-signedout-import-denied.png"),
  );

  await browser.close();
  writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      { at: new Date().toISOString(), base: BASE, results },
      null,
      2,
    ),
  );
  const failures = results.filter((r) => r.status === "FAIL").length;
  console.log(
    `\n${results.length - failures}/${results.length} steps passed. Results: ${RESULTS_PATH}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(
    `qualification crashed: ${error instanceof Error ? error.stack : String(error)}`,
  );
  writeFileSync(
    RESULTS_PATH,
    JSON.stringify(
      { at: new Date().toISOString(), crashed: String(error), results },
      null,
      2,
    ),
  );
  process.exit(1);
});
