/** Isolated regression for the provider requirement behind production issue #286. */
import assert from "node:assert/strict";
import { ClerkStaffAccountDirectory } from "../convex/lib/clerkStaffAccount";

const usernames = new Set<string>();
const directory = new ClerkStaffAccountDirectory("fixture", (async (
  _url,
  init,
) => {
  const body = JSON.parse(String(init?.body));
  if (
    typeof body.username !== "string" ||
    !/^[a-zA-Z0-9_]{4,64}$/.test(body.username)
  ) {
    return new Response(
      JSON.stringify({
        errors: [
          {
            long_message: '["username"] data does not match user requirements',
          },
        ],
      }),
      { status: 422 },
    );
  }
  assert(
    !usernames.has(body.username),
    "Different hires must not collide on username",
  );
  usernames.add(body.username);
  assert.equal(body.email_address[0], "fixture@example.invalid");
  assert.equal(body.first_name, "Deep");
  return new Response(JSON.stringify({ id: `fixture_${usernames.size}` }));
}) as typeof fetch);
for (let n = 0; n < 2; n++) {
  assert.equal(
    (
      await directory.createWithPassword({
        email: "fixture@example.invalid",
        givenName: "Deep",
        familyName: "Dev",
        password: "synthetic-password",
      })
    ).passwordEnabled,
    true,
  );
}
console.log(
  "PASS: required username supplied automatically, unique for same-name hires; email and profile name unchanged.",
);

let invitationSent = false;
const invitationDirectory = new ClerkStaffAccountDirectory("fixture", (async (
  url,
  init,
) => {
  assert.equal(
    String(url),
    "https://api.clerk.com/v1/organizations/org_fixture/invitations",
  );
  assert.equal(init?.method, "POST");
  const body = JSON.parse(String(init?.body));
  assert.deepEqual(body, {
    email_address: "fixture@example.invalid",
    role: "org:member",
    redirect_url: "https://capsule.example.invalid/",
  });
  invitationSent = true;
  return new Response(
    JSON.stringify({ id: "orginv_fixture", status: "pending" }),
  );
}) as typeof fetch);
await invitationDirectory.sendOrganizationInvitation({
  organizationId: "org_fixture",
  email: "fixture@example.invalid",
  appUrl: "https://capsule.example.invalid/",
});
assert.equal(invitationSent, true);
console.log(
  "PASS: isolated Clerk invitation request has scoped workspace and Capsule redirect; no Resend or password email.",
);

const joinedDirectory = new ClerkStaffAccountDirectory(
  "fixture",
  (async () =>
    new Response(
      JSON.stringify({
        errors: [
          {
            code: "already_a_member_in_organization",
            message: "Already joined",
          },
        ],
      }),
      { status: 400 },
    )) as typeof fetch,
);
assert.equal(
  await joinedDirectory.sendOrganizationInvitation({
    organizationId: "org_fixture",
    email: "fixture@example.invalid",
    appUrl: "https://capsule.example.invalid/",
  }),
  false,
);

const requests: string[] = [];
const resendDirectory = new ClerkStaffAccountDirectory("fixture", (async (
  url,
  init,
) => {
  requests.push(`${init?.method ?? "GET"} ${url}`);
  if (requests.length === 1)
    return new Response(
      JSON.stringify({
        errors: [{ code: "organization_invitation_not_unique" }],
      }),
      { status: 400 },
    );
  if (requests.length === 2)
    return Response.json({
      data: [
        {
          id: "other",
          email_address: "other@example.invalid",
          status: "pending",
        },
        {
          id: "ours",
          email_address: "fixture@example.invalid",
          status: "pending",
        },
      ],
      total_count: 2,
    });
  if (requests.length === 3) {
    assert(String(url).endsWith("/ours/revoke"));
    return Response.json({ id: "ours", status: "revoked" });
  }
  return Response.json({ id: "fresh", status: "pending" });
}) as typeof fetch);
assert.equal(
  await resendDirectory.sendOrganizationInvitation({
    organizationId: "org_fixture",
    email: "fixture@example.invalid",
    appUrl: "https://capsule.example.invalid/",
  }),
  true,
);
assert.equal(requests.length, 4);
console.log(
  "PASS: existing membership reports no email; resend replaces only the matching pending invitation.",
);
