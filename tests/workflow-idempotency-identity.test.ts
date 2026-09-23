import { describe, expect, it } from "vitest";

import { workflowIdempotencyIdentity } from "../src/lib/workflowIdempotencyIdentity";

const SEP = "\u001f";

const externalFixture = {
  tenantId: "tenant-1",
  endpoint: "/api/manifest/main/commands/createEvent",
  key: "partner-key-9",
};

const webhookFixture = {
  provider: "stripe",
  connectionId: "acct_123",
  providerEventId: "evt_456",
};

const importFixture = {
  tenantId: "tenant-1",
  sourceSystem: "tpp",
  artifactChecksum: "sha256:abc",
  sourceRecordId: "MenuItemSak-77",
  parserVersion: "v3",
};

const reactionFixture = {
  tenantId: "tenant-1",
  parentId: "event-9",
  purpose: "prep_task_from_line",
  sourceKey: "line-12",
};

const weeklyFixture = {
  tenantId: "tenant-1",
  weekStart: 1700000000000,
  eventId: "event-9",
  ingredientId: "ing-4",
  unit: "kg",
};

const egenFixture = {
  tenantId: "tenant-1",
  eventId: "event-9",
  sourceLineId: "line-12",
  purpose: "pack_line",
};

describe("workflowIdempotencyIdentity", () => {
  it("same inputs produce the same identity for every class", () => {
    const classes = [
      () => workflowIdempotencyIdentity.externalRequest(externalFixture),
      () => workflowIdempotencyIdentity.providerWebhook(webhookFixture),
      () => workflowIdempotencyIdentity.importRecord(importFixture),
      () => workflowIdempotencyIdentity.reactionChild(reactionFixture),
      () => workflowIdempotencyIdentity.weeklyPurchase(weeklyFixture),
      () => workflowIdempotencyIdentity.eventGeneratedRow(egenFixture),
    ] as const;
    const tokens = ["ext", "hook", "imp", "rxn", "week", "egen"];

    classes.forEach((call, i) => {
      const first = call();
      const second = call();
      expect(second).toBe(first);
      expect(first).toMatch(new RegExp(`^${tokens[i]}${SEP}`));
    });
  });

  it("changing any one field changes the identity", () => {
    const base = workflowIdempotencyIdentity.externalRequest(externalFixture);
    expect(
      workflowIdempotencyIdentity.externalRequest({
        ...externalFixture,
        tenantId: "tenant-2",
      }),
    ).not.toBe(base);
    expect(
      workflowIdempotencyIdentity.externalRequest({
        ...externalFixture,
        endpoint: "/api/manifest/main/commands/createClient",
      }),
    ).not.toBe(base);
    expect(
      workflowIdempotencyIdentity.externalRequest({
        ...externalFixture,
        key: "partner-key-10",
      }),
    ).not.toBe(base);

    const hookBase =
      workflowIdempotencyIdentity.providerWebhook(webhookFixture);
    expect(
      workflowIdempotencyIdentity.providerWebhook({
        ...webhookFixture,
        provider: "square",
      }),
    ).not.toBe(hookBase);
    expect(
      workflowIdempotencyIdentity.providerWebhook({
        ...webhookFixture,
        connectionId: "acct_999",
      }),
    ).not.toBe(hookBase);
    expect(
      workflowIdempotencyIdentity.providerWebhook({
        ...webhookFixture,
        providerEventId: "evt_789",
      }),
    ).not.toBe(hookBase);

    const impBase = workflowIdempotencyIdentity.importRecord(importFixture);
    expect(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        tenantId: "tenant-2",
      }),
    ).not.toBe(impBase);
    expect(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        sourceSystem: "beo",
      }),
    ).not.toBe(impBase);
    expect(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        artifactChecksum: "sha256:def",
      }),
    ).not.toBe(impBase);
    expect(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        sourceRecordId: "MenuItemSak-78",
      }),
    ).not.toBe(impBase);
    expect(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        parserVersion: "v4",
      }),
    ).not.toBe(impBase);

    const rxnBase = workflowIdempotencyIdentity.reactionChild(reactionFixture);
    expect(
      workflowIdempotencyIdentity.reactionChild({
        ...reactionFixture,
        tenantId: "tenant-2",
      }),
    ).not.toBe(rxnBase);
    expect(
      workflowIdempotencyIdentity.reactionChild({
        ...reactionFixture,
        parentId: "event-10",
      }),
    ).not.toBe(rxnBase);
    expect(
      workflowIdempotencyIdentity.reactionChild({
        ...reactionFixture,
        purpose: "staff_row_from_line",
      }),
    ).not.toBe(rxnBase);
    expect(
      workflowIdempotencyIdentity.reactionChild({
        ...reactionFixture,
        sourceKey: "line-13",
      }),
    ).not.toBe(rxnBase);

    const weekBase = workflowIdempotencyIdentity.weeklyPurchase(weeklyFixture);
    expect(
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        tenantId: "tenant-2",
      }),
    ).not.toBe(weekBase);
    expect(
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        weekStart: 1700000000001,
      }),
    ).not.toBe(weekBase);
    expect(
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        eventId: "event-10",
      }),
    ).not.toBe(weekBase);
    expect(
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        ingredientId: "ing-5",
      }),
    ).not.toBe(weekBase);
    expect(
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        unit: "g",
      }),
    ).not.toBe(weekBase);

    const egenBase = workflowIdempotencyIdentity.eventGeneratedRow(egenFixture);
    expect(
      workflowIdempotencyIdentity.eventGeneratedRow({
        ...egenFixture,
        tenantId: "tenant-2",
      }),
    ).not.toBe(egenBase);
    expect(
      workflowIdempotencyIdentity.eventGeneratedRow({
        ...egenFixture,
        eventId: "event-10",
      }),
    ).not.toBe(egenBase);
    expect(
      workflowIdempotencyIdentity.eventGeneratedRow({
        ...egenFixture,
        sourceLineId: "line-13",
      }),
    ).not.toBe(egenBase);
    expect(
      workflowIdempotencyIdentity.eventGeneratedRow({
        ...egenFixture,
        purpose: "task_from_template",
      }),
    ).not.toBe(egenBase);
  });

  it("weekly purchase parts follow tenant, week, event, ingredient, unit", () => {
    const identity = workflowIdempotencyIdentity.weeklyPurchase({
      tenantId: "t",
      weekStart: 42,
      eventId: "e",
      ingredientId: "i",
      unit: "kg",
    });
    expect(identity.split(SEP)).toEqual([
      "week",
      encodeURIComponent("t"),
      encodeURIComponent("42"),
      encodeURIComponent("e"),
      encodeURIComponent("i"),
      encodeURIComponent("kg"),
    ]);
  });

  it("class prefixes never collide when the remaining parts match", () => {
    const rxn = workflowIdempotencyIdentity.reactionChild(reactionFixture);
    const egen = workflowIdempotencyIdentity.eventGeneratedRow({
      tenantId: reactionFixture.tenantId,
      eventId: reactionFixture.parentId,
      sourceLineId: reactionFixture.sourceKey,
      purpose: reactionFixture.purpose,
    });
    expect(egen).not.toBe(rxn);
  });

  it("colon-containing parts cannot smash two identities together", () => {
    expect(
      workflowIdempotencyIdentity.externalRequest({
        tenantId: "a:b",
        endpoint: "c",
        key: "k",
      }),
    ).not.toBe(
      workflowIdempotencyIdentity.externalRequest({
        tenantId: "a",
        endpoint: "b:c",
        key: "k",
      }),
    );
    expect(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        artifactChecksum: "sha256:abc",
        sourceRecordId: "x",
      }),
    ).not.toBe(
      workflowIdempotencyIdentity.importRecord({
        ...importFixture,
        artifactChecksum: "sha256",
        sourceRecordId: "abc:x",
      }),
    );
  });

  it("blank parts and a non-finite weekStart are refused", () => {
    expect(() =>
      workflowIdempotencyIdentity.externalRequest({
        ...externalFixture,
        key: "   ",
      }),
    ).toThrow(/key is required/);
    expect(() =>
      workflowIdempotencyIdentity.providerWebhook({
        ...webhookFixture,
        providerEventId: "",
      }),
    ).toThrow(/providerEventId is required/);
    expect(() =>
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        weekStart: Number.NaN,
      }),
    ).toThrow(/weekStart is required/);
    expect(() =>
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        weekStart: Infinity,
      }),
    ).toThrow(/weekStart is required/);
    expect(
      workflowIdempotencyIdentity.weeklyPurchase({
        ...weeklyFixture,
        weekStart: 0,
      }),
    ).toMatch(new RegExp(`^week${SEP}`));
  });
});
