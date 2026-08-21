<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository-specific guidance

- The Git root is `web/`; run all `npm` and `tsx` commands from this directory.
- `app/` is the Next App Router entrypoint. Public routes are under `app/entities`, `app/texts`, and `app/search`; admin pages and mutations are under `app/admin`.
- `/admin` is guarded in both `proxy.ts` and the server actions; retain server-side session checks when changing write operations.
- `lib/db/store.ts` selects SQLite by default or Supabase when `DATA_BACKEND=supabase`; keep `lib/db/schema.ts` and `supabase/schema.sql` aligned when changing the data model.
- Local SQLite defaults to `data/app.db`, and `SQLITE_PATH` is relative to `web/`. Supabase requires applying `supabase/schema.sql` first and setting `SUPABASE_URL` plus the server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Copy `.env.example` to `.env.local` for the Next server. Standalone `tsx` scripts do not load `.env.local`; set non-default variables in the shell before running them. The example local login is `admin` / `change-me`; production requires `ADMIN_PASSWORD` and `AUTH_SECRET`.
- `npm run seed` is destructive: it deletes all SQLite rows at `SQLITE_PATH` (or `data/app.db`) before writing fictional fixtures. Use it only with disposable data.
- Content is parsed into blocks and stored links; changes involving wiki links or Markdown must go through `lib/markdown.ts`, `lib/links.ts`, and `lib/render.ts` rather than bypassing the restricted renderer.
- `npm run verify` is the focused functional check and expects the fixture records from `npm run seed`; no test script or test suite is configured.
- For validation, run `npm run lint`, `npm run typecheck`, `npm run verify`, then `npm run build`; `npm run start` serves the completed production build.
- The parent `DEVELOPMENT.md` is requirements/spec text and its "implementation pending" status predates this codebase; use the package scripts and source for current behavior.
