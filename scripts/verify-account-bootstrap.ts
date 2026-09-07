import { strict as assert } from "node:assert";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const modules = {
  "../convex/authLink.ts": () => import("../convex/authLink"),
  "../convex/authStatus.ts": () => import("../convex/authStatus"),
  "../convex/_generated/server.ts": () => import("../convex/_generated/server"),
};
process.env.CONVEX_FIELD_ENCRYPTION_KEY = "account-bootstrap-local-proof-only";
const t = convexTest(schema, modules);
const member = t.withIdentity({
  subject: "account-a",
  issuer: "https://fixture.invalid",
  tenantId: "tenant-a",
  role: "org:admin",
});
const profile = {
  email: "fixture@example.invalid",
  givenName: "Angriff",
  familyName: "",
};
const imported = await t.run((ctx) =>
  ctx.db.insert("people", {
    tenantId: "tenant-a",
    givenName: "Ryan",
    familyName: "Ostwind",
    email: profile.email,
    role: "owner",
    status: "active",
    employmentType: "full_time",
    deletedAt: null,
    version: 1,
    authSubjectId: null,
  }),
);
await t.run((ctx) =>
  ctx.db.insert("externalRecordLinks", {
    tenantId: "tenant-a",
    sourceSystem: "tpp_legacy",
    recordType: "staff",
    externalId: "legacy-1",
    capsuleEntity: "person",
    capsuleId: imported,
    verified: true,
    conflictStatus: "resolved",
    deletedAt: null,
    version: 1,
  }),
);
assert.equal(
  (await t.mutation(internal.authLink.createAccountProfile, profile)).linked,
  false,
);
await Promise.all([
  member.mutation(internal.authLink.createAccountProfile, profile),
  member.mutation(internal.authLink.createAccountProfile, profile),
]);
const status = await member.query(api.authStatus.getAuthStatus, {});
assert.equal(status.profile?.givenName, "Angriff");
assert.equal(status.role, "admin");
assert.notEqual(status.personId, imported);
assert.equal(
  (await t.run((ctx) => ctx.db.query("people").collect())).length,
  2,
);
assert.equal((await t.run((ctx) => ctx.db.get(imported)))?.authSubjectId, null);
assert.equal(
  (await member.mutation(internal.authLink.createAccountProfile, profile))
    .reason,
  "already",
);
const other = t.withIdentity({
  subject: "account-b",
  issuer: "https://fixture.invalid",
  tenantId: "tenant-a",
  role: "org:staff",
});
await other.mutation(internal.authLink.createAccountProfile, {
  ...profile,
  email: "other@example.invalid",
  givenName: "Other",
});
assert.notEqual(
  (await other.query(api.authStatus.getAuthStatus, {})).personId,
  status.personId,
);
assert.equal(
  (await member.query(api.authStatus.getAuthStatus, {})).personId,
  status.personId,
);
const fresh = t.withIdentity({
  subject: "import-claim",
  issuer: "https://fixture.invalid",
});
assert.equal(
  (
    await fresh.mutation(internal.authLink.linkBySubjectEmail, {
      subject: "import-claim",
      email: profile.email,
    })
  ).reason,
  "no_match",
);
await t.run((ctx) => ctx.db.patch(status.profile!._id, { status: "inactive" }));
assert.equal(
  (await member.mutation(internal.authLink.createAccountProfile, profile))
    .reason,
  "released",
);
process.env.CLERK_SECRET_KEY = "local-proof-placeholder";
const fetchOriginal = globalThis.fetch;
let providerCalls = 0;
globalThis.fetch = (async () => {
  providerCalls++;
  return new Response(
    JSON.stringify({
      id: "account-c",
      username: "AccountC",
      primary_email_address_id: "email-c",
      email_addresses: [
        {
          id: "email-c",
          email_address: "c@example.invalid",
          verification: { status: "verified" },
        },
      ],
    }),
  );
}) as typeof fetch;
const c = t.withIdentity({
  subject: "account-c",
  issuer: "https://fixture.invalid",
  tenantId: "tenant-a",
  role: "org:staff",
});
assert.equal(
  (await c.action(api.authLink.ensureAccountProfile, {})).linked,
  true,
);
assert.equal(
  (await c.query(api.authStatus.getAuthStatus, {})).profile?.givenName,
  "AccountC",
);
assert.equal(
  (await c.action(api.authLink.ensureAccountProfile, {})).reason,
  "already",
);
assert.equal(providerCalls, 1);
globalThis.fetch = fetchOriginal;
for (const role of ["org:member", "org:custom_catering"]) {
  const normal = t.withIdentity({
    subject: role,
    issuer: "https://fixture.invalid",
    tenantId: "tenant-a",
    role,
  });
  await normal.mutation(internal.authLink.createAccountProfile, {
    ...profile,
    email: `${role}@example.invalid`,
  });
  assert.equal(
    (await normal.query(api.authStatus.getAuthStatus, {})).role,
    "staff",
  );
}
console.log(
  "PASS: anonymous denied; concurrent/repeated bootstrap idempotent; imports untouched and not claimable; trusted role preserved; accounts isolated; inactive account not recreated.",
);
console.log(
  "PASS: public setup action creates provider-derived profile; repeat login reuses it without provider call.",
);
console.log(
  "PASS: default Clerk members and custom roles create usable staff profiles.",
);
const hiredId = await t.run((ctx) =>
  ctx.db.insert("people", {
    tenantId: "tenant-a",
    givenName: "Hired",
    familyName: "Worker",
    email: "hire@example.invalid",
    role: "kitchen_manager",
    status: "active",
    employmentType: "contractor",
    deletedAt: null,
    version: 1,
  }),
);
const hire = t.withIdentity({
  subject: "hired-account",
  issuer: "https://fixture.invalid",
  tenantId: "tenant-a",
  role: "org:member",
});
await hire.mutation(internal.authLink.createAccountProfile, {
  email: "hire@example.invalid",
  givenName: "Hired",
  familyName: "Worker",
});
const hiredStatus = await hire.query(api.authStatus.getAuthStatus, {});
assert.equal(hiredStatus.personId, hiredId);
assert.equal(hiredStatus.role, "kitchen_manager");
assert.equal(
  (await t.run((ctx) => ctx.db.get(hiredId)))?.employmentType,
  "contractor",
);
console.log(
  "PASS: org-member invitation retains hired identity, role and employment data; unclaimed import reports no_match rather than revoked access.",
);
