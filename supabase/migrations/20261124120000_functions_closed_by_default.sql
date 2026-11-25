-- A new function in `public` starts closed to clients (principle 6). Supabase's default privileges
-- handed every function the migrations create (they run as `postgres`) to anon and authenticated by
-- name, so a migration that forgot its `revoke` left an internal helper callable from the browser —
-- that is how tv_emit and tv_events_prune stayed open (20261124090000_tenant_guards). From here on
-- forgetting fails closed: a function the app calls signed in needs its own
-- `grant execute … to authenticated`; internal helpers and ticks need nothing (service_role keeps
-- its default). Existing functions keep their grants, and so does `create or replace` of one with
-- the same arguments; a new argument list or `drop` + `create` is a new function and grants anew.
-- Postgres's own default gives EXECUTE to PUBLIC in every schema, and a per-schema entry can only
-- add to it, so the PUBLIC grant goes from the global default; anon and authenticated from the
-- entry Supabase made for `public`. Functions postgres creates elsewhere (the `ops` schema) revoke
-- their grants themselves and are called only by definer functions — the owner keeps EXECUTE
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
-- an extension postgres installs later into `extensions` keeps Postgres's usual open functions:
-- a per-schema entry adds back what the global one took away
alter default privileges for role postgres in schema extensions
  grant execute on functions to public;
