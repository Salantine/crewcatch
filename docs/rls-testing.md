# Testing Row Level Security at runtime

## The gap this closes

`npm run check:rls` validates that every tenant table has RLS **enabled**,
**forced**, and **covered by policies**. It is a static check — it runs without
a database, which is why it can run in every CI build.

It cannot prove the policies **behave**. A policy with an inverted condition,
a `using` clause referencing the wrong column, or a helper function that returns
the wrong row would all pass that check and silently leak one contractor's leads
to another. That is the failure mode worth spending real effort on: it is
invisible in review and catastrophic in production.

## Running the runtime suite

```bash
supabase test db
```

The suite lives at `supabase/tests/database/rls_isolation.test.sql` and is
written in pgTAP. It requires a reachable Postgres instance.

**This suite cannot be executed in the current development environment** —
there is no Postgres binary, no Docker, and no Supabase CLI available here. It
is written and statically validated (it parses as valid SQL and its pgTAP
assertion count matches its declared `plan()`), but it has not been *run*.
Treat it as unverified until CI executes it against a real database.

## What it asserts

27 assertions across six areas, each wrapped in `begin`/`rollback` so the
fixtures never persist:

1. **Own-row visibility** — an owner sees their own leads, calls, and entity.
2. **Cross-tenant isolation** — the assertion that matters. An owner cannot
   `SELECT`, `UPDATE`, or `DELETE` another contractor's lead, cannot read
   another contractor's entity, and cannot `INSERT` into another tenant's
   namespace. The victim's row is re-read afterwards to prove the refused
   writes changed nothing.
3. **Signed-out access** — an anonymous client sees nothing.
4. **Authenticated non-member** — distinct from anonymous, and the more
   realistic threat: a logged-in stranger who is not a customer.
5. **Own-writes succeed** — verified with `returning`, because `lives_ok` also
   passes when zero rows matched and therefore cannot distinguish "wrote the
   row" from "silently did nothing".
6. **Multi-membership** — a user belonging to two contractors sees **zero rows**
   when no contractor is selected (fail closed, not "first by accident"), the
   selected tenant when `x-contractor-id` is set, and nothing at all when the
   header names a contractor they do not belong to.

## Simulating identity

Postgres evaluates policies against the request context, so the tests set the
same state PostgREST would:

```sql
set_config('role', 'authenticated', true);
set_config('request.jwt.claim.sub', '<user uuid>', true);
set_config('request.headers', '{"x-contractor-id":"<uuid>"}', true);
```

## Adding tables

A new tenant-scoped table needs:
- an entry in `TENANT_TABLES` in `scripts/check-rls.mjs`, or `check:rls` fails
- fixtures and allow/deny assertions in the pgTAP suite

The static check failing is the cheap signal; the runtime suite is the one that
proves it.
