/**
 * AC-414 / AC-435 runtime regression for issue #390.
 *
 * AC-414: the three acceptance paths — operator `Proposal_accept`, the
 * generated `SignatureRequest_complete` (SignatureCompleted → Proposal.accept
 * reaction) and the anonymous public seam
 * (convex/signatureAcceptance.completeSignature) — must produce the SAME
 * canonical acceptance: one ProposalAccepted ledger row with the exact
 * acceptedRevisionId and eventId, and the same live menu copy
 * (ProposalDishSelection → EventDish.confirmFromProposal) with the same
 * copied fields and no removed line.
 *
 * Regressions these tests catch (observed on the public seam in #390):
 *   - a public path that skips the menu cascade entirely, so a digitally
 *     signed event starts with an empty kitchen board while the operator
 *     path shows the full menu;
 *   - a public path that never validates the linked Event's tenant, so a
 *     corrupted proposal.eventId pointing at another tenant's Event is
 *     accepted and ledgered instead of rejected atomically;
 *   - a public path that duplicates the accept logic outside the generated
 *     runner, so a tenant's disabled `sales` capability switch is ignored;
 *   - replay/mixed orderings (re-click, public-then-operator,
 *     operator-then-public, a second request on an accepted proposal) must
 *     never double-apply the menu copy or add a second ProposalAccepted.
 *
 * Fixtures follow the accepted-revision-link / proposal-event-booking proofs:
 * real governed commands only, one shared anonymous convexTest instance, and
 * typed reads of persisted rows.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  // ONE raw anonymous instance, shared with the proof-kit root through a
  // factory — a second convexTest() call would create a separate database,
  // not the one the owner actor writes to.
  const anonymous = convexTest(schema, modules);
  return Object.assign(
    createManifestTestContext({
      convexTest: (() => anonymous) as never,
      schema,
      modules,
    }),
    { anonymous },
  );
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type Proof = ReturnType<typeof harness>;

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

type Fixture = {
  clientId: string;
  menuId: string;
  eventId: string;
  proposalId: string;
  revisionId: string;
  dishIds: { kept1: string; kept2: string; removed: string };
  selectionIds: { kept1: string; kept2: string; removed: string };
};

const EVENT_ARGS = {
  title: "Equivalence gala",
  eventType: "gala dinner",
  startsAt: Date.parse("2026-10-03T18:00:00Z"),
  endsAt: Date.parse("2026-10-03T23:00:00Z"),
  expectedHeadcount: 80,
  primaryContactName: "Casey Contact",
  budgetAmount: 0,
  quotedPrice: 1300,
  venueName: "Riverside Hall",
};

const SELECTION_A = {
  quantityServings: 80,
  course: "main",
  serviceStyle: "plated",
  specialInstructions: "Plate the cedar salmon first",
};
const SELECTION_B = {
  quantityServings: 40,
  course: "side",
  serviceStyle: "buffet",
  specialInstructions: "Hold the brisket warm until doors",
};

async function seedOperatorPerson(
  proof: Proof,
  owner: Actor,
  tenantId: string,
  subject: string,
) {
  // The signature commands guard on user.personId, which only a linked Person
  // row provides (person-first auth, convex/lib/authContext.ts).
  await proof.seedEntity(owner, "people", {
    tenantId,
    givenName: "Sig",
    familyName: "Owner",
    email: `${subject}@example.com`,
    role: "owner",
    employmentType: "full_time",
    status: "active",
    authSubjectId: subject,
    version: 1,
  });
}

/** Client + published menu + three active dishes, seeded through real commands. */
async function seedCatalog(proof: Proof, owner: Actor, tenantId: string) {
  const client = (await proof.executeCommand(
    owner,
    api.mutations.Client_createViaRegister,
    { clientType: "company", companyName: `Equivalence client ${tenantId}` },
  )) as { docId: string };
  const menu = (await proof.executeCommand(
    owner,
    api.mutations.Menu_createViaDraft,
    { name: "Equivalence tasting menu" },
  )) as { docId: string };
  await proof.executeCommand(owner, api.mutations.Menu_markPublished, {
    docId: menu.docId,
  });
  const kept1 = (await proof.executeCommand(
    owner,
    api.mutations.Dish_createViaIntroduce,
    { name: "Cedar salmon", portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  const kept2 = (await proof.executeCommand(
    owner,
    api.mutations.Dish_createViaIntroduce,
    { name: "Smoked brisket", portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  const removed = (await proof.executeCommand(
    owner,
    api.mutations.Dish_createViaIntroduce,
    { name: "Panna cotta", portionSize: 1, portionUnit: "serving" },
  )) as { docId: string };
  return {
    clientId: client.docId,
    menuId: menu.docId,
    dishIds: { kept1: kept1.docId, kept2: kept2.docId, removed: removed.docId },
  };
}

/**
 * A proposal ALREADY LINKED to its Event (event-first conversion path, spec
 * §7.2.2): two live selections with distinct servings/course/style/instructions
 * plus one removed selection, sent with revision capture, then viewed — the
 * exact pre-acceptance state all three acceptance paths must agree on.
 */
async function linkedProposalFixture(
  proof: Proof,
  owner: Actor,
  tenantId: string,
  title: string,
): Promise<Fixture> {
  const seed = await seedCatalog(proof, owner, tenantId);
  const event = (await proof.executeCommand(
    owner,
    api.mutations.Event_createViaPlanEngagement,
    { clientId: seed.clientId, ...EVENT_ARGS },
  )) as { docId: string };
  const proposal = (await proof.executeCommand(
    owner,
    api.mutations.Proposal_createViaDraft,
    {
      clientId: seed.clientId,
      title,
      subtotal: 1200,
      taxAmount: 100,
      discountAmount: 0,
      total: 1300,
      eventType: EVENT_ARGS.eventType,
      eventDate: EVENT_ARGS.startsAt,
      eventEndDate: EVENT_ARGS.endsAt,
      guestCount: 80,
      venueName: EVENT_ARGS.venueName,
      eventId: event.docId,
    },
  )) as { docId: string };
  const kept1 = (await proof.executeCommand(
    owner,
    api.mutations.ProposalDishSelection_createViaSelect,
    {
      proposalId: proposal.docId,
      menuId: seed.menuId,
      dishId: seed.dishIds.kept1,
      ...SELECTION_A,
    },
  )) as { docId: string };
  const kept2 = (await proof.executeCommand(
    owner,
    api.mutations.ProposalDishSelection_createViaSelect,
    {
      proposalId: proposal.docId,
      menuId: seed.menuId,
      dishId: seed.dishIds.kept2,
      ...SELECTION_B,
    },
  )) as { docId: string };
  const removedSel = (await proof.executeCommand(
    owner,
    api.mutations.ProposalDishSelection_createViaSelect,
    {
      proposalId: proposal.docId,
      menuId: seed.menuId,
      dishId: seed.dishIds.removed,
      quantityServings: 24,
      course: "dessert",
    },
  )) as { docId: string };
  await proof.executeCommand(
    owner,
    api.mutations.ProposalDishSelection_remove,
    { docId: removedSel.docId },
  );
  await proof.executeCommand(
    owner,
    api.lib.proposalRevision.sendProposalWithRevisionCapture,
    { docId: proposal.docId },
  );
  await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
    docId: proposal.docId,
  });
  const revisions = (await owner.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: proposal.docId },
  )) as Array<{ _id: string; revisionNumber: number }>;
  expect(revisions).toHaveLength(1);
  return {
    clientId: seed.clientId,
    menuId: seed.menuId,
    eventId: event.docId,
    proposalId: proposal.docId,
    revisionId: revisions[0]._id,
    dishIds: seed.dishIds,
    selectionIds: {
      kept1: kept1.docId,
      kept2: kept2.docId,
      removed: removedSel.docId,
    },
  };
}

/**
 * An internal SignatureRequest for the fixture's captured revision, created
 * through the real governed command (needs the operator's linked Person).
 */
async function createSignatureRequest(
  proof: Proof,
  owner: Actor,
  tenantId: string,
  subject: string,
  fx: Pick<Fixture, "proposalId" | "revisionId">,
  opts?: { provider?: "docusign"; expiresAt?: number; proposalId?: string },
) {
  await seedOperatorPerson(proof, owner, tenantId, subject);
  const signature = (await proof.executeCommand(
    owner,
    api.mutations.SignatureRequest_createViaRequestSignature,
    {
      proposalRevisionId: fx.revisionId,
      proposalId: opts?.proposalId ?? fx.proposalId,
      recipientEmail: "signer@example.com",
      recipientName: "Casey Contact",
      ...(opts?.provider ? { provider: opts.provider } : {}),
      ...(opts?.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    },
  )) as { docId: string };
  return signature.docId;
}

// ---------------------------------------------------------------------------
// Typed persisted-state reads
// ---------------------------------------------------------------------------

type ProposalRow = {
  _id: string;
  status?: string;
  acceptedRevisionId?: string | null;
  eventId?: string | null;
};

async function proposalRow(actor: Actor, proposalId: string) {
  return (await actor.run(async (ctx) =>
    ctx.db.get(proposalId as never),
  )) as ProposalRow;
}

type EventDishRow = {
  _id: string;
  eventId?: string;
  dishId?: string;
  quantityServings?: number;
  course?: string | null;
  serviceStyle?: string | null;
  specialInstructions?: string | null;
  deletedAt?: number | null;
};

async function liveEventDishes(actor: Actor, eventId: string) {
  const rows = (await actor.run(async (ctx) =>
    ctx.db.query("eventDishes").collect(),
  )) as EventDishRow[];
  return rows.filter((row) => row.eventId === eventId && row.deletedAt == null);
}

type LedgerRow = {
  type: string;
  entityId: string;
  payload: Record<string, unknown>;
};

async function ledgerRows(actor: Actor) {
  return (await actor.run(async (ctx) =>
    ctx.db.query("manifestEvents").collect(),
  )) as LedgerRow[];
}

async function acceptanceLedgerRows(actor: Actor, proposalId: string) {
  return (await ledgerRows(actor)).filter(
    (row) => row.type === "ProposalAccepted" && row.entityId === proposalId,
  );
}

async function signatureCompletedRows(actor: Actor, requestId: string) {
  return (await ledgerRows(actor)).filter(
    (row) => row.type === "SignatureCompleted" && row.entityId === requestId,
  );
}

// ---------------------------------------------------------------------------
// Canonical acceptance assertion (AC-414)
// ---------------------------------------------------------------------------

type MenuExpectation = {
  dishId: string;
  quantityServings: number;
  course: string;
  serviceStyle: string;
  specialInstructions: string;
  existingRowId?: string;
};

/** The menu set the proposal's live selections say the event must hold. */
function proposalMenuExpectation(fx: Fixture): MenuExpectation[] {
  return [
    { dishId: fx.dishIds.kept1, ...SELECTION_A },
    { dishId: fx.dishIds.kept2, ...SELECTION_B },
  ];
}

async function assertCanonicalAcceptance(
  actor: Actor,
  fx: Fixture,
  expectedMenu: MenuExpectation[],
) {
  // Exactly one canonical acceptance, naming the captured revision and the
  // linked event.
  const proposal = await proposalRow(actor, fx.proposalId);
  expect(proposal.status).toBe("accepted");
  expect(proposal.acceptedRevisionId ?? null).toBe(fx.revisionId);
  expect(proposal.eventId ?? null).toBe(fx.eventId);

  const ledger = await acceptanceLedgerRows(actor, fx.proposalId);
  expect(ledger).toHaveLength(1);
  expect(ledger[0].payload.acceptedRevisionId).toBe(fx.revisionId);
  expect(ledger[0].payload.eventId).toBe(fx.eventId);

  // The event holds exactly the expected live menu set with the copied
  // fields — not "some rows" (count alone cannot distinguish two correct
  // rows from two wrong ones).
  const dishes = await liveEventDishes(actor, fx.eventId);
  expect(dishes).toHaveLength(expectedMenu.length);
  const byDish = new Map(dishes.map((row) => [row.dishId as string, row]));

  // AC-435 promises no duplicate EFFECTS, not just no duplicate rows: every
  // confirmed EventDish carries exactly one EventDishConfirmedFromProposal
  // ledger event naming that row, so a retry that preserved the rows but
  // re-emitted confirmations still fails here.
  const confirmations = (await ledgerRows(actor)).filter(
    (row) =>
      row.type === "EventDishConfirmedFromProposal" &&
      row.payload.eventId === fx.eventId,
  );
  expect(confirmations).toHaveLength(expectedMenu.length);
  for (const expected of expectedMenu) {
    const confirmedForDish = confirmations.filter(
      (row) => row.payload.dishId === expected.dishId,
    );
    expect(confirmedForDish).toHaveLength(1);
    const confirmedRow = byDish.get(expected.dishId);
    expect(confirmedRow).toBeTruthy();
    expect(confirmedForDish[0].entityId).toBe(confirmedRow?._id);
    expect(confirmedForDish[0].payload.eventDishId).toBe(confirmedRow?._id);
    expect(confirmedForDish[0].payload.eventId).toBe(fx.eventId);
  }

  // The canonical fixtures are isolated: exactly the fixture revision exists
  // for the proposal, and exactly the fixture Event exists.
  const revisions = (await actor.query(
    api.queries.listProposalRevisionByProposalId,
    { proposalId: fx.proposalId },
  )) as Array<{ _id: string }>;
  expect(revisions).toHaveLength(1);
  expect(revisions[0]._id).toBe(fx.revisionId);
  const events = (await actor.run(async (ctx) =>
    ctx.db.query("events").collect(),
  )) as Array<{ _id: string }>;
  expect(events.map((row) => row._id)).toEqual([fx.eventId]);

  for (const expected of expectedMenu) {
    const row = byDish.get(expected.dishId);
    expect(row).toBeTruthy();
    expect(row?.quantityServings).toBe(expected.quantityServings);
    expect(row?.course).toBe(expected.course);
    expect(row?.serviceStyle).toBe(expected.serviceStyle);
    expect(row?.specialInstructions).toBe(expected.specialInstructions);
    if (expected.existingRowId !== undefined) {
      // Kitchen edit wins: the pre-existing line is kept, not re-created.
      expect(row?._id).toBe(expected.existingRowId);
    }
  }
  // The removed selection never copies.
  expect(byDish.has(fx.dishIds.removed)).toBe(false);
}

// ---------------------------------------------------------------------------
// The three acceptance paths over one equivalent fixture
// ---------------------------------------------------------------------------

async function acceptCanonically(mode: "operator" | "generated" | "public") {
  const tenantId = `tenant-sig-equiv-${mode}`;
  const proof = harness();
  const owner = proof.asRole({
    subject: `owner-sig-equiv-${mode}`,
    role: "owner",
    tenantId,
  });
  const fx = await linkedProposalFixture(
    proof,
    owner,
    tenantId,
    `Equivalence proposal (${mode})`,
  );
  if (mode === "operator") {
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: fx.proposalId,
    });
  } else if (mode === "generated") {
    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      `owner-sig-equiv-${mode}`,
      fx,
    );
    // No generated command sets callbackToken; seed it the way the authored
    // seam does so complete's guard passes (existing fixture pattern).
    await owner.run(async (ctx) =>
      ctx.db.patch(requestId as never, { callbackToken: "proof-token" }),
    );
    await proof.executeCommand(owner, api.mutations.SignatureRequest_complete, {
      docId: requestId,
      callbackToken: "proof-token",
      signedArtifactReference: "proof://signed",
    });
  } else {
    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      `owner-sig-equiv-${mode}`,
      fx,
    );
    // The public seam is bearer-token authorized — the request row's id IS
    // the token — and reads no Clerk identity, so the shared raw anonymous
    // instance is exactly the caller the anonymous acceptance page presents.
    const result = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: requestId },
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
  }
  return { proof, owner, fx };
}

describe("signature acceptance equivalence (AC-414, issue #390)", () => {
  it("operator Proposal_accept produces the canonical acceptance and menu copy", async () => {
    const { owner, fx } = await acceptCanonically("operator");
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));
  });

  it("generated SignatureRequest_complete produces the same canonical acceptance and menu copy", async () => {
    const { owner, fx } = await acceptCanonically("generated");
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));
  });

  it("public anonymous completeSignature produces the same canonical acceptance and menu copy", async () => {
    const { owner, fx } = await acceptCanonically("public");
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));
  });
});

// ---------------------------------------------------------------------------
// Replay / mixed ordering (AC-435)
// ---------------------------------------------------------------------------

describe("mixed and retried acceptance orderings (AC-435)", () => {
  it("public-first: re-click stays idempotent and an operator retry is refused without a second menu set", async () => {
    const tenantId = "tenant-sig-mixed-public-first";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-mixed-public-first",
      role: "owner",
      tenantId,
    });
    const fx = await linkedProposalFixture(
      proof,
      owner,
      tenantId,
      "Public-first proposal",
    );
    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-mixed-public-first",
      fx,
    );

    const firstClick = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: requestId },
    )) as { ok: boolean };
    expect(firstClick.ok).toBe(true);
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));

    // Re-click / reload after the committed acceptance: success, no second
    // SignatureCompleted, no second menu copy.
    const reClick = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: requestId },
    )) as { ok: boolean };
    expect(reClick.ok).toBe(true);
    expect(await signatureCompletedRows(owner, requestId)).toHaveLength(1);
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));

    // The operator retry is refused by the existing status guard — the
    // acceptance is already final.
    await expect(
      proof.executeCommand(owner, api.mutations.Proposal_accept, {
        docId: fx.proposalId,
      }),
    ).rejects.toThrow(/Guard/);
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));
  });

  it("operator-first: public completion of an accepted proposal adds no second menu set or acceptance", async () => {
    const tenantId = "tenant-sig-mixed-operator-first";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-mixed-operator-first",
      role: "owner",
      tenantId,
    });
    const fx = await linkedProposalFixture(
      proof,
      owner,
      tenantId,
      "Operator-first proposal",
    );

    // The operator accepts first; the public click lands afterwards (slow
    // signer, stale tab).
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: fx.proposalId,
    });
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));

    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-mixed-operator-first",
      fx,
    );
    const click = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: requestId },
    )) as { ok: boolean };
    expect(click.ok).toBe(true);

    // The request is completed exactly once, and the acceptance, menu set
    // and stored revision all stay as the operator left them.
    expect(await signatureCompletedRows(owner, requestId)).toHaveLength(1);
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));

    // A SECOND public request for the same accepted proposal: idempotent
    // success, one completion per completed request, still one acceptance
    // and one menu set.
    const secondRequestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-mixed-operator-first",
      fx,
    );
    const secondClick = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: secondRequestId },
    )) as { ok: boolean };
    expect(secondClick.ok).toBe(true);
    expect(await signatureCompletedRows(owner, secondRequestId)).toHaveLength(
      1,
    );
    await assertCanonicalAcceptance(owner, fx, proposalMenuExpectation(fx));
  });
});

// ---------------------------------------------------------------------------
// Kitchen-edited EventDish wins
// ---------------------------------------------------------------------------

describe("existing kitchen-edited EventDish wins", () => {
  const KITCHEN_EDIT = {
    quantityServings: 12,
    course: "dessert",
    serviceStyle: "family style",
    specialInstructions: "Kitchen cut this to 12 — keep the plating",
  };

  async function fixtureWithKitchenEdit(
    proof: Proof,
    owner: Actor,
    tenantId: string,
    title: string,
  ) {
    const fx = await linkedProposalFixture(proof, owner, tenantId, title);
    // The kitchen already composed dish 1 on the event through the canonical
    // manager command, with fields that differ from the proposal selection.
    const kitchenLine = (await proof.executeCommand(
      owner,
      api.mutations.EventDish_createViaAddToEvent,
      {
        eventId: fx.eventId,
        dishId: fx.dishIds.kept1,
        ...KITCHEN_EDIT,
      },
    )) as { docId: string };
    return { fx, kitchenLineId: kitchenLine.docId };
  }

  function kitchenMenuExpectation(
    fx: Fixture,
    kitchenLineId: string,
  ): MenuExpectation[] {
    return [
      {
        dishId: fx.dishIds.kept1,
        ...KITCHEN_EDIT,
        existingRowId: kitchenLineId,
      },
      { dishId: fx.dishIds.kept2, ...SELECTION_B },
    ];
  }

  it("operator accept keeps the kitchen line and adds only the missing live selection", async () => {
    const tenantId = "tenant-sig-kitchen-operator";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-kitchen-operator",
      role: "owner",
      tenantId,
    });
    const { fx, kitchenLineId } = await fixtureWithKitchenEdit(
      proof,
      owner,
      tenantId,
      "Kitchen-edit proposal (operator)",
    );
    await proof.executeCommand(owner, api.mutations.Proposal_accept, {
      docId: fx.proposalId,
    });
    await assertCanonicalAcceptance(
      owner,
      fx,
      kitchenMenuExpectation(fx, kitchenLineId),
    );
  });

  it("public acceptance keeps the kitchen line and adds only the missing live selection", async () => {
    const tenantId = "tenant-sig-kitchen-public";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-kitchen-public",
      role: "owner",
      tenantId,
    });
    const { fx, kitchenLineId } = await fixtureWithKitchenEdit(
      proof,
      owner,
      tenantId,
      "Kitchen-edit proposal (public)",
    );
    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-kitchen-public",
      fx,
    );
    const result = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: requestId },
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    await assertCanonicalAcceptance(
      owner,
      fx,
      kitchenMenuExpectation(fx, kitchenLineId),
    );
  });
});

// ---------------------------------------------------------------------------
// Atomic downstream rejection: foreign-tenant linked Event
// ---------------------------------------------------------------------------

describe("atomic rejection when the linked Event is foreign", () => {
  it("public acceptance refuses a proposal whose eventId names another tenant's Event, writing nothing", async () => {
    const tenantId = "tenant-sig-foreign-host";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-foreign-host",
      role: "owner",
      tenantId,
    });
    const fx = await linkedProposalFixture(
      proof,
      owner,
      tenantId,
      "Corrupted-link proposal",
    );

    // A real Event in ANOTHER tenant, created through real commands.
    const foreignTenant = "tenant-sig-foreign-other";
    const foreignOwner = proof.asRole({
      subject: "owner-sig-foreign-other",
      role: "owner",
      tenantId: foreignTenant,
    });
    const foreignClient = (await proof.executeCommand(
      foreignOwner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Foreign tenant client" },
    )) as { docId: string };
    const foreignEvent = (await proof.executeCommand(
      foreignOwner,
      api.mutations.Event_createViaPlanEngagement,
      { clientId: foreignClient.docId, ...EVENT_ARGS },
    )) as { docId: string };

    // Corrupt ONLY the linked event reference: a well-formed id that exists,
    // but in another tenant. The generated relation/tenant checks must remain
    // the authority that refuses the cascade.
    await owner.run(async (ctx) =>
      ctx.db.patch(fx.proposalId as never, { eventId: foreignEvent.docId }),
    );

    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-foreign-host",
      fx,
    );

    // Relevant persisted state before the attempt.
    const proposalBefore = await proposalRow(owner, fx.proposalId);
    const requestBefore = (await owner.run(async (ctx) =>
      ctx.db.get(requestId as never),
    )) as Record<string, unknown>;
    const ledgerBefore = await ledgerRows(owner);
    const dishesBefore = (await owner.run(async (ctx) =>
      ctx.db.query("eventDishes").collect(),
    )) as EventDishRow[];
    const foreignEventBefore = (await owner.run(async (ctx) =>
      ctx.db.get(foreignEvent.docId as never),
    )) as Record<string, unknown>;

    // The bad relation must be refused atomically. The repaired-link retry
    // below proves why it was refused without coupling to generated error
    // wording.
    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: requestId,
      }),
    ).rejects.toThrow();

    // Nothing was written: no completion, no acceptance, no menu copy, and
    // the foreign Event is untouched.
    const proposalAfter = await proposalRow(owner, fx.proposalId);
    expect(proposalAfter).toEqual(proposalBefore);
    const requestAfter = (await owner.run(async (ctx) =>
      ctx.db.get(requestId as never),
    )) as Record<string, unknown>;
    expect(requestAfter.status).toBe("requested");
    expect(requestAfter).toEqual(requestBefore);
    expect(await ledgerRows(owner)).toEqual(ledgerBefore);
    expect(
      (await owner.run(async (ctx) =>
        ctx.db.query("eventDishes").collect(),
      )) as EventDishRow[],
    ).toEqual(dishesBefore);
    const foreignEventAfter = (await owner.run(async (ctx) =>
      ctx.db.get(foreignEvent.docId as never),
    )) as Record<string, unknown>;
    expect(foreignEventAfter).toEqual(foreignEventBefore);

    // Valid counterpart: repairing ONLY the corrupted relation lets the SAME
    // request token succeed — the refusal tracks the bad link, it is not an
    // always-rejecting seam.
    await owner.run(async (ctx) =>
      ctx.db.patch(fx.proposalId as never, { eventId: fx.eventId }),
    );
    const repaired = (await proof.anonymous.mutation(
      api.signatureAcceptance.completeSignature,
      { token: requestId },
    )) as { ok: boolean };
    expect(repaired.ok).toBe(true);

    // Exactly one canonical acceptance naming the captured revision and the
    // proposal's own Event, and exactly one completion of this request.
    const proposalAccepted = await proposalRow(owner, fx.proposalId);
    expect(proposalAccepted.status).toBe("accepted");
    expect(proposalAccepted.acceptedRevisionId ?? null).toBe(fx.revisionId);
    expect(proposalAccepted.eventId ?? null).toBe(fx.eventId);
    const acceptances = await acceptanceLedgerRows(owner, fx.proposalId);
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0].payload.acceptedRevisionId).toBe(fx.revisionId);
    expect(acceptances[0].payload.eventId).toBe(fx.eventId);
    expect(await signatureCompletedRows(owner, requestId)).toHaveLength(1);

    // The menu copy landed on the proposal's own Event with exactly the two
    // live selections — never the removed one — and never on the foreign
    // Event, whose row is still exactly what it was before the refusal.
    const copied = await liveEventDishes(owner, fx.eventId);
    expect(copied.map((row) => row.dishId as string).sort()).toEqual(
      [fx.dishIds.kept1, fx.dishIds.kept2].sort(),
    );
    const allDishes = (await owner.run(async (ctx) =>
      ctx.db.query("eventDishes").collect(),
    )) as EventDishRow[];
    expect(
      allDishes.filter((row) => row.eventId === foreignEvent.docId),
    ).toHaveLength(0);
    const foreignEventRepaired = (await owner.run(async (ctx) =>
      ctx.db.get(foreignEvent.docId as never),
    )) as Record<string, unknown>;
    expect(foreignEventRepaired).toEqual(foreignEventBefore);
  });
});

// ---------------------------------------------------------------------------
// Disabled sales capability
// ---------------------------------------------------------------------------

describe("disabled sales capability (tenant kill-switch)", () => {
  it("public acceptance fails with the canonical sales policy and rolls back every write", async () => {
    const tenantId = "tenant-sig-sales-disabled";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-sales-disabled",
      role: "owner",
      tenantId,
    });
    const fx = await linkedProposalFixture(
      proof,
      owner,
      tenantId,
      "Sales-disabled proposal",
    );
    const requestId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-sales-disabled",
      fx,
    );

    // The tenant switches its sales domain off through the stored settings
    // row (Permissions UI writes these; missing row = allowed). Seed AFTER
    // the request exists — the request command itself is a sales command.
    await proof.seedEntity(owner, "organizationCapabilitySettings", {
      tenantId,
      capability: "sales",
      enabled: false,
      version: 1,
    });

    const ledgerBefore = await ledgerRows(owner);
    // The refusal must come from the canonical generated sales policy, not
    // an incidental error — the seam must route through the same capability
    // check the generated runner applies.
    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: requestId,
      }),
    ).rejects.toThrow("Sales staff may read proposals");

    // Full rollback: the request stays requested, the proposal stays viewed,
    // no completion/acceptance reached the ledger, no menu copy landed.
    const requestAfter = (await owner.run(async (ctx) =>
      ctx.db.get(requestId as never),
    )) as { status?: string };
    expect(requestAfter.status).toBe("requested");
    const proposalAfter = await proposalRow(owner, fx.proposalId);
    expect(proposalAfter.status).toBe("viewed");
    expect(proposalAfter.acceptedRevisionId ?? null).toBeNull();
    expect(await ledgerRows(owner)).toEqual(ledgerBefore);
    expect(await liveEventDishes(owner, fx.eventId)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Public token guards
// ---------------------------------------------------------------------------

describe("public token guards", () => {
  const INVALID_TOKEN_MESSAGE =
    "This acceptance link is no longer valid. Please contact us for a new one.";
  const UNAVAILABLE_MESSAGE =
    "The proposal for this acceptance link is unavailable. Please contact us.";
  const INCONSISTENT_MESSAGE =
    "This acceptance link is inconsistent. Please contact us for a new one.";

  it("invalid, expired, revoked, non-internal, mismatched and foreign tokens are refused with no writes", async () => {
    const tenantId = "tenant-sig-token-guards";
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-sig-token-guards",
      role: "owner",
      tenantId,
    });

    // Two captured proposals in the tenant: one owns the requests, one is
    // the wrong target for the mismatch case. No events, no menu copies —
    // token-guard refusals must write nothing anywhere.
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Token-guard client" },
    )) as { docId: string };
    async function capturedViewedProposal(title: string) {
      const proposal = (await proof.executeCommand(
        owner,
        api.mutations.Proposal_createViaDraft,
        {
          clientId: client.docId,
          title,
          subtotal: 300,
          taxAmount: 0,
          discountAmount: 0,
          total: 300,
        },
      )) as { docId: string };
      await proof.executeCommand(
        owner,
        api.lib.proposalRevision.sendProposalWithRevisionCapture,
        { docId: proposal.docId },
      );
      await proof.executeCommand(owner, api.mutations.Proposal_markViewed, {
        docId: proposal.docId,
      });
      const revisions = (await owner.query(
        api.queries.listProposalRevisionByProposalId,
        { proposalId: proposal.docId },
      )) as Array<{ _id: string }>;
      expect(revisions).toHaveLength(1);
      return { proposalId: proposal.docId, revisionId: revisions[0]._id };
    }
    const base = await capturedViewedProposal("Token-guard proposal");
    const other = await capturedViewedProposal("Other proposal");
    // Relative expiry/issuance times: the guards must fail on actual clock
    // state, not on a fixed date the suite eventually catches up with.
    const now = Date.now();

    // A real captured revision in ANOTHER tenant, for the foreign-revision
    // request row.
    const foreignTenant = "tenant-sig-token-foreign";
    const foreignOwner = proof.asRole({
      subject: "owner-sig-token-foreign",
      role: "owner",
      tenantId: foreignTenant,
    });
    const foreignClient = (await proof.executeCommand(
      foreignOwner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Token-guard foreign client" },
    )) as { docId: string };
    const foreignProposal = (await proof.executeCommand(
      foreignOwner,
      api.mutations.Proposal_createViaDraft,
      {
        clientId: foreignClient.docId,
        title: "Foreign tenant proposal",
        subtotal: 300,
        taxAmount: 0,
        discountAmount: 0,
        total: 300,
      },
    )) as { docId: string };
    await proof.executeCommand(
      foreignOwner,
      api.lib.proposalRevision.sendProposalWithRevisionCapture,
      { docId: foreignProposal.docId },
    );
    const foreignRevisions = (await foreignOwner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: foreignProposal.docId },
    )) as Array<{ _id: string }>;
    expect(foreignRevisions).toHaveLength(1);

    // Build every guard-fixture request FIRST (their setup writes ledger
    // events), snapshot the ledger, then run the anonymous attempts — the
    // refusals themselves must write nothing.
    // Not a request id at all (no setup; attempted below).

    // Expired request.
    const expiredId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-token-guards",
      base,
      { expiresAt: now - 1 },
    );

    // Revoked request.
    const revokedId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-token-guards",
      base,
    );
    await proof.executeCommand(owner, api.mutations.SignatureRequest_revoke, {
      docId: revokedId,
      revokeReason: "Client asked to withdraw",
    });

    // Non-internal provider: external envelopes complete through their own
    // verified callbacks; their row ids are not public bearer tokens.
    const externalId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-token-guards",
      base,
      { provider: "docusign" },
    );

    // Mismatched proposal: the request names a different proposal than the
    // displayed revision's — accepting B while showing A must be refused.
    const mismatchedId = await createSignatureRequest(
      proof,
      owner,
      tenantId,
      "owner-sig-token-guards",
      base,
      { proposalId: other.proposalId },
    );

    // Foreign revision: a request row pointing at another tenant's revision
    // must resolve to nothing.
    const foreignRequestId = await proof.seedEntity(
      owner,
      "signatureRequests",
      {
        tenantId,
        proposalRevisionId: foreignRevisions[0]._id,
        proposalId: base.proposalId,
        recipientEmail: "signer@example.com",
        recipientName: "Casey Contact",
        status: "requested",
        provider: "internal",
        requestedAt: now - 1000,
        expiresAt: now + 86400000,
        deletedAt: null,
        createdAt: now - 1000,
        updatedAt: now - 1000,
        version: 1,
      },
    );

    const ledgerBefore = await ledgerRows(owner);

    // Not a request id at all.
    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: "sig_not_a_real_id",
      }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);

    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: expiredId,
      }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);

    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: revokedId,
      }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);

    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: externalId,
      }),
    ).rejects.toThrow(INVALID_TOKEN_MESSAGE);

    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: mismatchedId,
      }),
    ).rejects.toThrow(INCONSISTENT_MESSAGE);

    await expect(
      proof.anonymous.mutation(api.signatureAcceptance.completeSignature, {
        token: foreignRequestId as string,
      }),
    ).rejects.toThrow(UNAVAILABLE_MESSAGE);

    // No acceptance, no completion, no menu write anywhere.
    expect(await ledgerRows(owner)).toEqual(ledgerBefore);
    expect(await acceptanceLedgerRows(owner, base.proposalId)).toHaveLength(0);
    expect(await acceptanceLedgerRows(owner, other.proposalId)).toHaveLength(0);
    const dishes = (await owner.run(async (ctx) =>
      ctx.db.query("eventDishes").collect(),
    )) as EventDishRow[];
    expect(dishes).toHaveLength(0);
    for (const id of [
      expiredId,
      revokedId,
      externalId,
      mismatchedId,
      foreignRequestId as string,
    ]) {
      const row = (await owner.run(async (ctx) => ctx.db.get(id as never))) as {
        status?: string;
      };
      expect(["requested", "revoked"]).toContain(row.status);
    }
    expect((await proposalRow(owner, base.proposalId)).status).toBe("viewed");
    expect((await proposalRow(owner, other.proposalId)).status).toBe("viewed");
  });
});
