<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# orgCart project rules

orgCart helps student organizations plan event-supply purchases within a budget
(event brief → Gemini shopping plan → editable cart → PayPal sandbox checkout).

## Stack and constraints

- Next.js App Router, React, TypeScript, Tailwind CSS.
- Zero cost: all development tools and services must remain free.
- Local TypeScript catalog (`lib/catalog.ts`); no database or authentication.
- Use "orgCart" for visible branding. Catalog prices are labeled demo data.
- Keep money in integer cents. Keep browser-only code in client components.
- Avoid new dependencies unless necessary.

## Scope

- Build only the phase that was requested; do not start later phases early.
- Phase 2 (done): catalog browsing and a manual, browser-persisted cart.
- Phase 3 (done): PayPal sandbox checkout with server-side capture.
- Next: Gemini shopping planner. Not started.
- PayPal must stay sandbox-only: never accept a non-sandbox `PAYPAL_API_BASE`.

## Secrets

- Keep credentials in `.env.local` (git-ignored). Never print, log, or commit them.
- Never expose server-side keys to client components.
- `.env.example` holds placeholders only; it is the one env file allowed in git.
- Automated tests must mock PayPal; never make real payment calls from tests.

## Verification

- Run `npm run lint`, `npm test`, and `npm run build` before committing.

## Commits

- Commit coherent, verified units of work with descriptive messages
  (e.g. `feat: …`, `fix: …`, `docs: …`). No empty or artificially split commits.
- Inspect staged diffs and stage specific files; exclude unrelated changes,
  secrets, `node_modules`, and build output.
- Never amend existing commits, rewrite history, or force-push.
- Create local commits only; the maintainer pushes.
- If Git identity is missing, ask rather than inventing one.
