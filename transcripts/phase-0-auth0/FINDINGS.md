# Phase 0 — Auth0 tenant verification (run before writing any auth code)

Date: 2026-08-20. Tenant: `dev-yg.us.auth0.com`. Client: `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA`.

Goal: the brief says **"Don't assume — verify."** So before deciding which token the API accepts,
find out what the tenant actually supports. Raw responses are saved next to this file
(`openid-configuration.json`, `jwks.json`) so the claims below are checkable.

## 1. Discovery document

```
curl -s https://dev-yg.us.auth0.com/.well-known/openid-configuration
```

| Field | Value | Why it matters |
|---|---|---|
| `issuer` | `https://dev-yg.us.auth0.com/` | **Note the trailing slash.** The API must compare `iss` to this exact string. |
| `jwks_uri` | `https://dev-yg.us.auth0.com/.well-known/jwks.json` | Public-key source for RS256 validation. |
| `code_challenge_methods_supported` | `["S256", "plain"]` | S256 is available. `plain` is also offered — we must *choose* S256; the tenant will not stop us using the weak one. |
| `response_types_supported` | includes `token`, `id_token`, `token id_token` | Implicit **is** enabled on this tenant. We deliberately do not use it. |
| `grant_types_supported` | includes `authorization_code`, `implicit`, `password`, `refresh_token` | Authorization Code is available; so is ROPG. We use code+PKCE only. |
| `token_endpoint_auth_methods_supported` | includes `none` | A **public client** is permitted → SPA + PKCE with no client secret is the right shape. |
| `id_token_signing_alg_values_supported` | `["HS256", "RS256", "PS256"]` | HS256 is offered for ID tokens. An HS256 ID token is signed with the *client secret*, not a JWKS key — a second, independent reason the API must never accept an ID token. |

## 2. JWKS

```
curl -s https://dev-yg.us.auth0.com/.well-known/jwks.json
```

Two RSA keys, both `"use":"sig"`, `"alg":"RS256"`, 2048-bit:

- `kid = tOu0FHcN3C2etrel4Qhaz`
- `kid = AU8Qa0nEiLZ2kCdVGwpR0`

**Two keys, not one.** So key selection must be by the token header's `kid`, and the JWKS client must
cache *and* be able to refetch on rotation. Hardcoding "the first key" would work today and break on
rotation. Our guard uses `jwks-rsa` with a cache + rate limit for exactly this reason.

## 3. Is `https://bbl-candidate-test-api` a real registered API?

This is the crux: Auth0 issues an **opaque** access token when the request has no registered API
audience, and a **JWT** access token when it does. Proven without any credentials, by comparing two
`/authorize` requests that differ only in the `audience` parameter:

**A. With the given audience** →
```
HTTP/1.1 302 Found
Location: /u/login?state=...
```
The client id, callback URL, `scope`, `audience` and `code_challenge_method=S256` are all accepted, and
Auth0 proceeds to universal login.

**B. With a bogus audience** (`https://not-a-real-api-xyz`) →
```
HTTP/1.1 302 Found
Location: http://localhost:3000/callback?error=access_denied
          &error_description=Service%20not%20found%3A%20https%3A%2F%2Fnot-a-real-api-xyz
```
"Service not found" — so the tenant resolves `audience` against registered Resource Servers, and
`https://bbl-candidate-test-api` **is** one. That is what makes the access token a verifiable JWT.

**C. With an unregistered `redirect_uri`** (`http://evil.example.com/cb`) → Auth0 renders its error
page rather than redirecting. Callback allow-listing is enforced tenant-side.

## 4. Conclusion → the token decision

**The API accepts the ACCESS token.** Reasons, from the evidence above:

1. The access token is only a *verifiable JWT* because we request `audience=https://bbl-candidate-test-api`
   (proof B). Drop the audience and Auth0 returns an opaque token that our API cannot validate offline
   at all — it would have to call `/userinfo` on every request.
2. The access token's `aud` names **our API**. The ID token's `aud` is the **client id**. Accepting an ID
   token at an API is textbook *audience confusion*: any token minted for that SPA — including one from
   a different app sharing the client — would be accepted.
3. The ID token is a statement *about the user, to the frontend*. The access token is an authorisation
   *to call this API*. Only the second is the right credential at an API boundary.
4. Per §1, ID tokens may be HS256-signed with the client secret; our API has no client secret and should
   never need one. RS256-via-JWKS is the only validation path we want to own.

So the guard validates: RS256 signature via JWKS (`kid`-selected), `iss === "https://dev-yg.us.auth0.com/"`,
`aud` includes `https://bbl-candidate-test-api`, and `exp`. Identity is the verified `sub`, never a body field.

## 5. Confirmed with a real token

Steps 1–4 above need no credentials, which is why they are recorded here. The remaining
proof — logging in for real and decoding the resulting tokens — needs the account password,
so it was run by hand with `scripts/verify-token.mjs`.

Result in [`token-inspection.md`](token-inspection.md). It confirms the access token is an
RS256 JWT signed by `kid=tOu0FHcN3C2etrel4Qhaz`, one of the two keys captured in
[`jwks.json`](jwks.json) before any code was written — and that the id_token from the same
login carries the client id as its `aud`.

It also turned up something the credential-free probes could not: **`aud` is an array**, so
the rule is "must include our API", not equality. See that file.
