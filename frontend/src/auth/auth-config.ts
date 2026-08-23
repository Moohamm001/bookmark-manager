/** Not secrets: a PKCE public client has no client secret. SDK choice: ADR-008. */
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
  throw new Error(
    `Missing frontend env vars: ${missing.join(', ')}. Copy frontend/.env.example to frontend/.env`,
  );
}
