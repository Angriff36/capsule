// AUTHOR-OWNED — not generated. The release commit this backend was deployed
// from (PR13-06 / AC-030). The committed value is always "unreleased";
// scripts/deploy-backend.sh writes the release sha here just before
// `convex deploy` and puts this file back right after, so only a backend
// deployed by the release path reports a real sha. A hand deploy reports
// "unreleased" and the release receipt never calls it shipped.
export const BACKEND_RELEASE_SHA: string = "unreleased";
