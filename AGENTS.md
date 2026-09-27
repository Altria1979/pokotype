<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Pokotype conventions

- Static Next.js App Router app. Do not add server-side user data or shared API keys.
- DeepSeek credentials belong to each user and may only be sent to the official API endpoint.
- Keep browser storage access behind client lifecycle boundaries.
- Preserve the independent romaji engine and its ambiguity regression tests.
- Before delivery, run lint, typecheck, unit tests, build and browser tests against the static output.
- Commit identity for this repository: `Altria1979 <58761705+Altria1979@users.noreply.github.com>`.
- Check repository-local author and committer identity before every commit. Do not inherit another account's global identity.
- Commit messages explain intent and include useful native trailers such as `Tested:`, `Not-tested:`, `Constraint:` and `Confidence:`.
- Do not force-push without an explicit exception from the owner.
