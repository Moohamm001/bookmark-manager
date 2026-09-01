# /transcripts

Real artefacts from the build, saved as they happened rather than reconstructed afterwards.

| File | What it is |
|---|---|
| `prompts.md` | **Every prompt I sent during the build, verbatim and unedited** — including the vague ones, the impatient one, and the bug report where my diagnosis was wrong |
| `phase-0-auth0/openid-configuration.json` | Raw discovery document, `curl`ed from the tenant |
| `phase-0-auth0/jwks.json` | Raw JWKS, unmodified |
| `phase-0-auth0/FINDINGS.md` | What those two documents actually say, the credential-free `/authorize` probes that prove `https://bbl-candidate-test-api` is a registered API, and the token decision derived from it |
| `phase-5-mutation-testing.md` | Breaking the code three times on purpose to check the tests notice. Includes the false negative that taught me the schema-vs-migration gap |
| `phase-6-frontend-versions.md` | The dependency findings: React Router v8's package name, MUI v9's Stack change, and the port-3000 constraint |

Nothing here is redacted except that no secrets were ever committed: the Auth0 client id and
API audience are public identifiers (a PKCE public client has no secret), and the test-user
password appears only in the brief, never in this repo.

**On the shape of these logs.** This was built in one long agentic session in Claude Code, where
the agent's side of each turn is a long tool trace rather than prose. So this folder holds two
things: `prompts.md` reproduces **my half of the conversation verbatim**, and the other files hold
the evidence — raw tool output, the exact commands, what failed and what I did about it. The
agent's outputs are the repository itself. The command outputs quoted throughout are copied from real runs; the
mutation-testing file in particular is a log of things going wrong, in the order they went
wrong, including the point where I nearly rewrote good tests because I had misread a result.
