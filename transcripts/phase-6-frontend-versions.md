# Phase 6 — three dependency findings worth writing down

The brief names "React Router v8" and "MUI v9". Both are real, but not in the way the obvious
`npm install` implies.

## 1. React Router v8 ships as `react-router`, not `react-router-dom`

```
$ npm view react-router-dom dist-tags
{ latest: '7.18.2', 'version-6': '6.30.6', classic: '5.3.4', ... }

$ npm view react-router dist-tags
{ latest: '8.3.0', 'version-7': '7.18.2', 'version-6': '6.30.6', ... }
```

`react-router-dom` stops at 7.18.2 — there is no v8 of it. From v7 onward the DOM package is
deprecated and everything is imported from `react-router` directly.

So `npm i react-router-dom@8` fails outright, and the muscle-memory import
`from 'react-router-dom'` would have pulled in a v7 package alongside v8. All imports in
`frontend/src` come from `react-router`.

## 2. MUI v9 removed system props from `Stack`

`@mui/material` 9.3.1 exists, so the version itself was straightforward. The API is not:

```
src/components/Layout.tsx(44,12): error TS2769: No overload matches this call.
  Property 'alignItems' does not exist on type 'IntrinsicAttributes & StackOwnProps & ...'
```

`alignItems` and `justifyContent` are no longer top-level props on `Stack`; they belong in
`sx`. Nine call sites migrated:

```diff
- <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
+ <Stack direction="row" sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
```

Worth noting because this is exactly the shape of thing an agent gets wrong from training
data: the v5/v6 syntax is overwhelmingly what exists on the internet, and it fails at
typecheck rather than at runtime — which is the good outcome.

Also `@mui/icons-material/DeleteOutline` does not exist; the module is `DeleteOutlined`.

## 3. The frontend must run on port 3000, and that is not negotiable

From the brief's configuration table: callback `http://localhost:3000/callback`, logout
`http://localhost:3000`. Vite defaults to 5173.

Phase 0 confirmed the tenant enforces this — an unregistered `redirect_uri` gets Auth0's error
page, not a redirect. So:

- `vite.config.ts` pins `port: 3000` with `strictPort: true`, so a collision fails loudly
  rather than silently starting on 3001 and breaking login in a confusing way.
- The API moved to **4000**, with `CORS_ORIGIN=http://localhost:3000` to match.

## End-to-end check

With both servers up, opening `http://localhost:3000/collections` redirects to the tenant:

```
Title: Log in | BBL Bookmarks (Full-Stack)
URL:   https://dev-yg.us.auth0.com/u/login?state=...

  Welcome
  Log in to dev-yg to continue to BBL Bookmarks (Full-Stack).
```

Auth0 rendering the application's registered name is the confirmation that the client id,
callback URL, scope and API audience were all accepted. Completing the login requires typing
the test password by hand.
