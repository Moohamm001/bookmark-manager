# Prompt history — the build session, verbatim

My actual prompts to the agent, in the order I sent them, **unedited**. I work in Thai, so they
appear as typed with an English gloss underneath.

Nothing here is cleaned up. Several are vague, a couple are impatient, and one is me reporting a
bug with a wrong diagnosis attached. That is the point — the brief asks for the messy parts, and
the messy parts are where the working relationship is actually visible.

**What this file is not:** a full turn-by-turn log. The session ran in Claude Code, where the
agent's replies are long tool traces; reproducing them would bury the signal. What is reproduced
faithfully is **every prompt I sent during the build**, plus what each one produced. The agent's
outputs are in the repository itself — that is the honest artefact of what it did.

**Boundary:** this file covers the build. After I submitted, I kept using the same session to
prepare for the on-site — those prompts are not part of the build and are excluded.

---

## Phase 0–1 · Opening move

> **`help me create an app by follow the requirements`**

That is the whole first prompt. Deliberately minimal — the requirements were a PDF in the repo
and a playbook file, and I wanted to see whether the agent would go and read them rather than
start generating a generic CRUD app.

**What it produced:** the agent read the brief, checked published versions of every named
dependency, and hit the Auth0 tenant before writing any code. That set the order for everything
after: verify, then decide, then build.

It also caught something I had not thought about — the brief PDF is marked CONFIDENTIAL and the
submission repo is public. It gitignored the PDF before the first commit.

---

## Phase 2 · The two decisions that were mine

The agent stopped and asked before building the schema. I chose:

| Question | My choice |
|---|---|
| Delete a collection — what happens to the bookmarks inside? | **Set them to uncategorised**, do not delete |
| §3.3 sharing — build it or not? | **Decide and document, do not build** |

Both were presented as options with a recommendation, and I took the recommendation both times.
That is recorded in `DECISIONS.md` and `AI_WORKFLOW.md` rather than dressed up as independent
judgement.

---

## Phase 3–6 · Reporting failures

These are the prompts I am least proud of and the most useful ones in the file. Every one of them
is me pasting a symptom, not a diagnosis.

> **`5:03:22 PM [vite] error when starting dev server: Error: Port 3000 is already in use`**

Pasted raw. Turned out to be the agent's own leftover dev server from an earlier step — and the
error was the port lock in `vite.config.ts` working as designed rather than a fault.

---

> **`กด accept แล้วไม่ไปต่อ`**
> *(pressed Accept and it goes no further)*

Six words and a screenshot. **This is the most valuable prompt in the whole build.**

The agent had verified everything up to the Auth0 login page and could go no further, because it
cannot type a password. The first thing past that line was broken: the `/callback` route
redirected on render and stripped `?code=` before the SDK could read it. Sign-in silently did
nothing.

At that point 109 tests, the typecheck, the lint and the custom privacy scanner were all green.
**No automated check could see it, because none of them open a browser.**

---

> **`fail to fetch in main page`**

Five words. My guess, recorded honestly in `AI_WORKFLOW.md`, was that the API call was malformed
or missing a header. **It was neither** — the backend simply was not running at the time.

What resolved it was the symptom, not my diagnosis. The lasting fix was to the error message
itself: `Failed to fetch` now names the URL, the likely cause, and the command to start the
backend.

---

## Phase 7 · Interrogating readiness

> **`สรุป flow ทีว่าตอนนี้ทำอะไรไปและความพร้อมส่งคือเท่าไหร่`**
> *(summarise the flow — what has been done, and how ready is this to submit)*

> **`ตอนนี้ code พร้อมส่งไหม`**
> *(is the code ready to submit now)*

I asked this twice at different points. Both times the answer separated **"the code is ready"**
from **"the submission is ready"**, which were not the same thing — the repo was not pushed, the
token verification had not been run by hand, and `AI_WORKFLOW.md` was still in the agent's voice.

---

> **`ตรงหน้า login ทำไมไม่มี create account หรือไม่ต้องมี`**
> *(why is there no create-account on the login page — or is it not needed)*

A question about something I did not understand, not a change request.

The answer required probing the tenant: `screen_hint=signup` does not reach a signup screen, so
sign-ups are disabled on the database connection. And our app should not have its own signup
regardless — identity is delegated, and a signup form would mean handling passwords, which is the
thing OIDC exists to avoid.

---

> **`สรุปคือแอปนี้ทำอะไรของ่ายๆ`**
> *(so what does this app actually do, simply)*

I asked for the plain-language version of my own project. Worth including because it is honest:
the app was built fast and I wanted the one-paragraph description I could say out loud.

---

## Phase 8 · Making the agent honest about itself

> **`AI_WORKFLOW.md แก้ยังไง และ verify token ใส่ที่ไหน`**
> *(how do I fix AI_WORKFLOW.md, and where does the token verification go)*

This led to the agent interviewing me instead of writing for me. It asked six questions. My
answers, verbatim:

> **`1. นายคิดว่าอะไรยาก ไม่รู้`** *(what did you think was hard — I don't know)*
> **`2. จ่ารายเดือนไว้ และ มี claude code`** *(I pay monthly and have Claude Code)*
> **`3. เชื่อเลย`** *(believed it immediately)*
> **`4. คิดว่า call api ผิด หรือ ลืม hEADER อะไรไป`** *(thought the API call was wrong, or a missing header)*
> **`5. ไม่มี`** *(none)*
> **`6. ไม่มี`** *(none)*

Answers 3, 5 and 6 mean: **I trusted the agent's technical claims without independently checking,
and there was no point in this build where I thought it was wrong and went to verify.**

Those three answers contradicted several sentences the agent had already drafted on my behalf —
including a line claiming a moment when I "stopped treating agent-written tooling as
automatically trustworthy." No such moment happened. Those sentences were removed and the
division of labour written plainly instead.

**This is the correction I would point to if asked what I actually contributed to the writeups.**

---

## Phase 8 · Cutting it back

> **`อยากทำให้นายทำ code ให้กระชับไม่เยอะเกินไป ให้ดูอ่านง่ายและลดการเขียนอะไรที่ไม่จำเป็นออกไปให้หมด`**
> *(make the code more concise, easier to read, cut everything unnecessary)*

> **`comments ลดได้อีกไหมเหลือ 30 %`**
> *(can comments be cut further, down to 30%)*

Two rounds. Comments went 308 → 188 → 52 lines, total 2,377 → 1,990, with the same 110 tests
passing throughout.

The second round also surfaced four dead API-client methods and a build artefact
(`tsconfig.tsbuildinfo`) that had been committed by mistake.

The argument that made the first round worth doing: a comment above the `/callback` route had
confidently described behaviour that was **false**, and that bug shipped. Long comments that
duplicate the docs do not just add noise — they drift, and then they lie.

---

## Phase 8 · Shipping

> **`push code ขึ้น github, แก้ aiworkflow.md`**
> *(push the code to GitHub, fix AI_WORKFLOW.md)*

> **`https://github.com/Moohamm001/bookmark-manager`**

The scan before the first public push caught the test-user password sitting in `README.md`. The
repo is public and that credential opens a live Auth0 tenant — it was removed before the push,
not after.

---

## What the shape of these prompts says about how I worked

Reading them back, three patterns are visible, and two of them are weaknesses.

**1. I gave direction at the start and at the boundaries, not in the middle.** The opening prompt
was deliberately open. After that I mostly reported symptoms and asked whether things were ready.
I did not steer mid-flight.

**2. My most valuable prompts were the shortest.** `กด accept แล้วไม่ไปต่อ` — six words — surfaced
the only bug that reached a user. Not because it was well written, but because I was the one
running the app.

**3. I did not push back.** There is no prompt in this file where I tell the agent it is wrong.
The corrections in this build came from tooling — the privacy scanner, the tests, and deliberately
breaking the code to check the tests noticed — not from me reading a diff and catching something.

That is the honest read, and it is why `AI_WORKFLOW.md` says the same thing rather than
implying otherwise.
