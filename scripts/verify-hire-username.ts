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
