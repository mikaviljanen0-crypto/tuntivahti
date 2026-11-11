# TJT portal account linking

## 1.3: review net hours and surname order

Daily cells, worker totals and the top review statistic use server-computed net
minutes in both calendar modes. The drilldown retains original times and shows
gross, net and allocated lunch. Workers are ordered by the last word of their
existing full name with Finnish collation, then given names and ID. Names are not
rewritten. Missing net values fail visibly; there is no silent gross fallback.

The computed field `review_net_minutes(time_entries)` is SECURITY INVOKER with an
unnamed argument (not a PostgREST RPC). Its private SECURITY DEFINER helper checks
the live active profile, organization and actual entry visibility before reading
the full employee-day. It returns only the authorized entry's net minutes. This
avoids a second lunch deduction when a foreman cannot read another worksite.
No entry, approval, payroll snapshot or RLS policy is changed. Existing lunch
rules (over six hours, 30 minutes, 11:00 priority then latest entries) are retained.
The existing BFF table allowlist and login grants are unchanged.

Build the 1.3 UI package from the exact installed 1.2 package with
`node portal/build-ui-update.cjs <1.2-folder> <new-1.3-folder>`.
Run `Paivita-Tunnit-1.3.ps1` on the Windows server. It checks both schema features,
baseline hashes, anonymous access denial and backups before/after replacing only
browser resources. Real Windows Scheduled Tasks/DPAPI/Drive are verified by the
installer on the user's server, not by Linux QA.

## 1.2: worksite cost codes and month overview

The 1.2 installer replaces **only** `tuntivahti/public/index.html` and its hashed
JS/CSS assets, updating the program manifest. It does not write SSO configuration,
credentials, grants, user data, the bridge, other apps, Tailscale or the database.
It requires the working 1.1 baseline and checks the new Supabase column before
stopping the server. Verified local/Drive backups, exact hashes, owned scheduled
tasks, anonymous-denial probes and program-only rollback are preserved.

Build: `node portal/build-ui-update.cjs <SSO-1.1-package> <new-output-directory>`.
Run `Paivita-Tunnit-1.2.ps1` on the Windows server. Windows Scheduled Tasks and real
portal rendering remain subject to installation and the user's signed-in check.

Database migration: `supabase/migrations/20261111122121_worksite_littera_selection.sql`.
Apply centrally once before releasing either browser build. The migration adds a
nullable allowlist to existing worksites; new sites must provide a nonempty list.
NULL is explicitly **review pending**, not an approved inference from old hours.
Empty confirmed arrays block new work. Same-org active cost codes are enforced on
new/reallocated work by an invoker trigger under existing RLS. Approval/note-only
updates preserve history; moving or extending an old allocation must use an
allowed code. An advisory lock serializes allowlist changes with allocation checks.
No time rows, code names, profiles, roles or payroll settings are rewritten.

Applied and verified on 2026-11-11: 1,582 time entries, exact full-row checksum
unchanged, all 12 sites still pending review, original 25 litteras unchanged.
Both triggers enabled; existing RLS remains enabled. New invoker trigger functions
have empty search paths and no anon/authenticated direct execution privilege.
86 tests passed, including bundle-only installer boundaries and retained SSO files.

Pre-existing Supabase security advisories were recorded before this release and
are not addressed by the feature migration: eight existing SECURITY DEFINER
functions executable by anon/authenticated and leaked-password protection disabled.
Review these separately rather than changing authentication/RLS as a side effect:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The code selector uses the existing Tuntivahti catalog. The Snedo target chart
was compared, but this release intentionally does not silently rename old codes
(notably 5805/8180), import new budget data or assume used codes were budgeted.
Automated Snedo target-estimate import is not included.

The month matrix uses actual calendar boundaries and the existing paginated API,
filters, day review, payroll locks and pre-lunch gross-hour semantics. Worker names
remain sticky on horizontal scroll. Local browser QA covers desktop/390px, 30/31
days, navigation, drilldown, code choices/clearing and worksite confirmation. The
Postgres tests execute the real migration in PGlite, including authenticated RLS,
legacy/history, invalid/foreign/inactive codes and no direct function execution.

## 1.1: expansion to existing TJT managers

The owner confirmed the 1.0 pilot worked, including portal logout/re-login,
and authorized rollout to other foremen on 2026-11-11. The 1.1 upgrade:

- Preserves the existing encryption key and refresh grants without overwriting them.
- Pins `organizationId` to the already-verified pilot binding, never to an arbitrary
  new sign-in. Migration refuses an absent/mismatched pilot binding.
- Allows active portal users with existing TJT-company access to link their own
  active Supabase `foreman` or `admin` account in that exact organization. No new
  Supabase roles or users are created. Workers and other organizations are denied.
- Uses editable email on first linking and a globally serialized uniqueness check:
  a Supabase user UUID cannot be bound to another portal user simultaneously.
- Keeps authorization on every request. Admin-only proxy routes stay admin-only.
  This release does not add a separate portal `Tunnit` permission; existing portal
  TJT access and the existing Supabase manager role are both required.
- Changes only the card, bridge/UI files, package manifest and public configuration.
  No portal user schema, password, firewall, Tailscale or Supabase migration changes.

Build using `node portal/build-foremen.cjs <original-1.0-package> <new-output-dir>`.
`Paivita-Tunnit-Tyonjohto.ps1` checks exact baseline hashes, backups and scheduled
tasks; rollback restores program/configuration files but deliberately never rolls
back live rotating refresh grants. The original 1.0 package is unchanged.

Verification: 65 automated tests pass, including different manager emails,
worker/cross-tenant rejection, tenant migration, duplicate/racing links, per-user
tokens/signout isolation, admin-route denial and preservation of the pilot grant.
The exact installed portal Auth contract, package hashes/card behavior/syntax and
both builds are checked. The browser fixture verifies editable own-account email,
the foreman's restricted navigation, logout denial and reopening the linked view
after simulated portal login. No real credentials or production data are used.
Windows installation and the first additional real manager linking still require
the user to run the package on TJT-PALVELIN.

## Original 1.0 pilot design and verification

The user story is portal login → Tunnit card → same-origin authenticated BFF →
the existing Supabase user's RLS-protected data → the redesigned Tuntivahti UI.
Workers continue using the public Vercel application without portal/Tailscale accounts.

This is a portal-managed, once-linked Supabase session, not an OIDC identity-provider
migration or a shared password database. The pilot is explicitly restricted to the
existing `mika.viljanen` portal owner and his verified existing Tuntivahti account.
No account is auto-created, merged by display name, or assigned a new role.

## Security boundaries

- The browser receives no Supabase bearer or refresh token. Each proxy call checks
  the current portal session, the pilot allowlist, and the current upstream profile.
- Portal sessions retain their existing idle/absolute limits. Status polling does
  not renew inactivity. Portal logout denies subsequent proxy calls. An already
  accepted in-flight write cannot be undone by logout.
- Explicit initial linking consent; password used once and not persisted. Refresh
  grants use AES-256-GCM with portal UUID AAD; the local Windows key uses DPAPI and
  private ACLs. Grant refresh is serialized per portal user.
- The proxy destination and routes are allowlisted, with same-origin CSRF checks,
  payload/time limits and no browser credential/header forwarding. It uses the
  linked user's token, not a service-role credential. Existing Supabase RLS and
  user-management checks remain authoritative.
- Public Tuntivahti sessions and other devices are independent of portal logout.
  Re-linking can be required if upstream refresh access expires or is revoked.
- Grant settings are intentionally not added to existing data-backup exports.
  Disaster recovery can require linking again. No password/session secrets ship
  in the installer or source repository.

## Builds and installation

Public Vercel builds have no `VITE_PORTAL_MODE` flag. They retain the existing login
and publish only already-public connection settings at
`/.well-known/tuntivahti-portal.json`. Privileged keys fail the build.

The portal build uses `VITE_PORTAL_MODE=true`, `VITE_PORTAL_URL=/`, and
`VITE_READ_ONLY_PREVIEW=false`. `build-package.cjs` creates a new package from the
retrieved, hash-pinned portal source archives and a freshly built UI. It will not
overwrite an existing output directory. See LUE-ENSIN.txt for deployment instructions.

The Windows installer checks exact source and payload hashes, backup/restore status,
task ownership and link-free paths. It modifies only server.cjs, portal.js, the package
manifest and a new module/settings directory; failure triggers best-effort recovery
of previous program files. It does not alter user databases, Supabase schemas,
Tailscale or firewall settings. Existing links for non-pilot users are preserved.

## Verification, 2026-11-11

- `npm test`: 53 passing tests, including request authorization, real Supabase client
  adapter behavior, refresh concurrency, revoked sessions, vault integrity and
  installer drift/tampering checks.
- `node portal/source-integration.cjs <source-archive-directory>`: exact installed
  Auth hash reconstructed and verified; real portal login/cookie/logout/revoke
  contract tested with synthetic users only.
- Public and portal production builds passed; public build has no portal UI or QA
  fixtures. A privileged-key build is rejected.
- Conditional card behavior and JavaScript syntax checked.
- Browser against local synthetic API: first-link form, connected dashboard,
  portal return, reopen without password, logout refusal, and reopening after
  simulated portal re-login. This is not a production Supabase authentication test.
- Windows Scheduled Tasks, DPAPI/ACL behavior and real Supabase linking are pending
  installation on the user's Windows server and the user's first consent/login.

`qa/portal-preview` is an isolated UI fixture with no production network/data and
is not included in either production build. Browser tests used its fixture controls,
not a real password. Local tests do not claim to verify production RLS policies.
