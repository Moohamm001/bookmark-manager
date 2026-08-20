/**
 * Auth0 configuration for the SPA.
 *
 * Why the official SDK rather than a hand-rolled PKCE flow:
 *
 * I did hand-roll it — `scripts/verify-token.mjs` in the repo root implements Authorization
 * Code + PKCE from scratch with `node:crypto`, and that is how I verified what the tenant
 * actually issues (see transcripts/phase-0-auth0/FINDINGS.md). Understanding the flow is
 * necessary. Shipping my own implementation of it is not: state validation, verifier
 * storage, token refresh, and the callback race conditions are all places where a subtle
 * bug is silent and severe. The SDK is audited; my 80 lines would not be.
 */
export const authConfig = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN as string,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID as string,
  audience: import.meta.env.VITE_AUTH0_AUDIENCE as string,
  redirectUri: import.meta.env.VITE_AUTH0_REDIRECT_URI as string,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string,
} as const;

const missing = Object.entries(authConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  // Fail at boot with a readable message. The alternative is a login redirect that
  // half-works and a 401 loop that looks like a backend bug.
  throw new Error(
    `Missing frontend env vars: ${missing.join(', ')}. Copy frontend/.env.example to frontend/.env`,
  );
}
