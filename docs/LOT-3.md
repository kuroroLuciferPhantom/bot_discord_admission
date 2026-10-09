# Lot 3 — NFT rules and role refresh

## Delivered

English, ephemeral `/rules add|edit|list|remove`, `/settings role-stacking`, `/settings check-frequency` and `/roles refresh`. Admin commands enforce Administrator at runtime and in Discord command defaults. Rule lists include an exact JSON export per page. Edits replace all fields.

Alchemy NFT v3 integration enumerates configured collections per verified wallet, with metadata disabled and complete bounded pagination. Copies are summed with bigint; ERC-721 has balance one and cannot appear in two wallets. IDs support decimal/hex normalization. Unknown standard, wrong contract, malformed balance, repeated cursor/ID, provider failure or page limit fails closed before Discord effects.

Persisted groups require the same network/contract/filter; non-stacking takes the highest eligible tier in each group. Rule/threshold uniqueness and twenty-rule limit are enforced. Managed role IDs survive edits/deletes to permit cleanup. Active-member tracking is persisted before role effects so partial updates remain discoverable for the next lot's retry jobs.

Discord preflight checks role existence, bot Manage Roles, hierarchy, integration-managed/everyone exclusions and dangerous role permissions. Only registered role IDs are changed using individual add/remove calls. Adds happen before removals; partial failures are explicitly reported. No automatic compensation promises Discord transactionality.

Wallet verification/removal triggers role refresh. A refresh failure does not undo wallet persistence. Config changes take effect on the next member refresh; no mass reassignment occurs in this lot. Check frequency is saved but the scheduler does not exist yet.

## Concurrency and limits

Repeatable-read snapshots and revision comparisons protect config reads. A shared in-process guild gate covers admin mutations, wallet association/removal and role refresh. **One replica only**; distributed lease coordination remains future work if hosting needs it. Two guild operations maximum concurrently; one-minute manual cooldown; bounded cooldown map, thirty-second inventory deadline and ten pages per wallet/contract.

## Validation

Unit coverage: tier stacking/non-stacking, large exact quantities, selected IDs, pagination and malformed data, multi-wallet sums, ERC-721 duplicates, provider failure, stale snapshots, role ordering/partial failures, admin authorization and dangerous roles. PostgreSQL CI also tests group consistency, cross-guild edit/delete rejection, revision changes, settings and managed-role retention.

No live Alchemy key, Discord permission test or real role mutation was performed. CI validates migrations and Docker alongside tests. Dependency advisories documented in Lot 1 remain outstanding before commercial release.

## Ownership freshness limitation

Alchemy ownership is indexed, and different wallet pages are not read at one atomic chain block. Duplicate ERC-721 ownership is rejected, but ERC-1155 balances can be temporarily stale after transfer. The current implementation is periodic token gating, not a financial entitlement oracle. Before release, test indexing latency; consider pinned-block RPC balance checks for known token IDs if stricter consistency is required.

## Next lot

Persisted scheduler/retries; check only active members, mark role-less members dormant; no automatic regrant until manual refresh; reconcile failed effects; operations and acceptance checklist. Frequency settings and RoleMember tracking are ready for this behavior.
