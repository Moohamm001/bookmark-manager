# Phase 0, steps 3–4 — real tokens, inspected by hand

> **TEMPLATE — not yet filled in.** Run the two commands below and paste the real output into
> the fenced blocks. Delete this note when done. Steps 1–2 (discovery + JWKS) needed no
> credentials and are already recorded in `FINDINGS.md`; these two need the test-user
> password, so they are done by hand.
>
> The script runs a genuine Authorization Code + PKCE (S256) flow, hand-rolled with
> `node:crypto` and no dependencies. The password is typed into Auth0's own login page,
> never into the script. **Redact the token values** — keep the header and the claims, cut
> the signature.

Date: <!-- fill in -->
Signed in as: `candidate@test.com`

---

## A. With `audience=https://bbl-candidate-test-api`

```bash
node scripts/verify-token.mjs
```

```
<!-- paste output here -->
```

**What to confirm in that output:**

- [ ] The access token **is** a JWT (three dot-separated parts)
- [ ] `header.alg` is `RS256`, and `header.kid` matches one of the two keys in `jwks.json`
- [ ] `iss` is `https://dev-yg.us.auth0.com/` — with the trailing slash
- [ ] `aud` includes `https://bbl-candidate-test-api` — **our API**
- [ ] `sub` is the user identifier the API will store as `auth0Sub`
- [ ] The `id_token`'s `aud` is the **client id** `H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA`, not the API

That last point is the whole of ADR-001 in one line: same login, same `sub`, two tokens —
and only `aud` separates "this is who the user is" from "this is permission to call that API".

---

## B. Without the audience parameter

```bash
node scripts/verify-token.mjs --no-audience
```

```
<!-- paste output here -->
```

**What to confirm:**

- [ ] The access token is **NOT** a JWT — it is an opaque string
- [ ] Therefore our API could not validate it offline at all; it would have to call
      `/userinfo` on every single request

---

## C. Conclusion, in your own words

<!--
Two or three sentences, yours not the script's. Worth covering:

  - Why the API takes the access token and not the ID token, now that you have seen both
    side by side.
  - What would break if the frontend dropped `audience` from authorizationParams — connect
    it to what you saw in B.
  - Whether anything here surprised you.

This is the paragraph an interviewer is most likely to ask you to expand on, so write it
from what you actually observed rather than restating ADR-001.
-->
