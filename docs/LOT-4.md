# Lot 4 — Durable holder checks

Stacked on Lot 3; no merge or production deployment performed.

## Delivered

- PostgreSQL due dates, expiring claim leases, attempt counts and sanitized error codes.
- Opt-in scheduler (`SCHEDULER_ENABLED=true`), disabled by default.
- Rolling one/two weekly checks, admin `/settings status`, server-isolated frequency updates.
- Remove-only checks: never promote or regrant roles; refresh remains the claim action.
- Current Discord role check before Alchemy; no role or confirmed departure makes the member dormant.
- Persistent bounded backoff, lease recovery after restart, safe stale completion handling.
- Existing active holders are queued if refresh after a wallet change fails.
- Sequential batches of at most five jobs, one-minute polling, graceful shutdown.

## Verification

Unit tests cover policy intervals/backoff, no role additions, dormant/departed users, provider errors, role races, partial removals, bounded batches, overlap prevention, polling cancellation and sanitized logs. PostgreSQL integration tests cover concurrent exclusive claims, expiry recovery, stale tokens, manual refresh invalidation, dormancy, guild isolation and rescheduling without postponing due/retry jobs. CI applies migrations twice and builds Docker.

No live Discord, mainnet RPC or Alchemy acceptance calls were made. Local PostgreSQL and Docker were unavailable; their checks run in CI.

## Acceptance before enabling

Use a dedicated application/server and test wallets. Apply migrations, redeploy guild commands, configure Alchemy, verify role hierarchy and refresh one eligible member. Confirm status and database due dates. In the test database only, advance that member's due date, enable the scheduler and verify: retained eligible roles, removed ineligible roles, no missing-tier additions, no further checks after dormancy. Refresh again to reactivate. Test departed members, Alchemy failure and missing Manage Roles: no false ownership-loss removals, persisted retries, recovery after restart. Verify ERC-1155 indexing around transfers across verified addresses. Stop the bot before manipulating fixtures; never advance production due dates for testing.

## Boundaries

One replica only: leases isolate queue claims, but Discord effects and interactive configuration use a process-local guild gate. Leases expire after five minutes; restart retries are reconciliation, not exactly-once effects. Due times are approximate under load. Removing several roles is not atomic. Dormancy preserves stored addresses/proof history, not deletion. Existing unregistered holders are not swept. Automatic checks never add roles; configuration changes do not trigger a guild-wide refresh. No admin force-check command is exposed yet.

Still required before sale: live acceptance, dependency advisory review, monitoring/alerts, backups and restoration test, retention/erasure policy, load/quota budgeting and distributed coordination if multiple replicas are introduced.
