# Code review — 12 October 2026

Reviewed the current implementation, including the unmerged per-guild Alchemy configuration in PR #6 (`c1b7d8207064c5bb6d1751bb41251af3e2ec3c36`). Corrections are isolated on `fix/code-review-hardening`, based on `feat/guild-alchemy-config`.

## Corrected findings

| Finding | Previous behavior | Corrected behavior |
| --- | --- | --- |
| Incomplete NFT inventory could revoke eligible roles | A page without a continuation cursor was accepted even when `totalCount` announced more tokens. A reproduced scheduled check removed a held tier using this incomplete inventory. | Require a safe, nonnegative integer total on every page, unchanged across pages, and verify the final distinct-token count before changing roles. Inconsistent inventory produces a provider error and preserves roles. ERC-1155 copies remain counted from balances, separately from distinct-token totals. |
| Response limits applied after the entire body was downloaded | `response.text()` accumulated the whole response before checking its length, including during API-key validation. | A shared JSON reader caps streamed bytes, cancels oversized or unsuccessful responses, handles the caller's deadline, releases stream locks and sanitizes parse errors. No additional runtime dependency. |
| Some management/moderation roles passed the eligibility guard | Manage Nicknames, Manage Guild Expressions, Manage Events, Pin Messages and Bypass Slowmode were absent from the forbidden permission mask. | Reject roles carrying these permissions during configuration and before role effects, alongside the existing role hierarchy and permission checks. |
| Transaction and receipt could describe different inclusions | The transport did not cross-check the receipt transaction hash or the transaction block number against the receipt. It also accepted a canonical block response with the wrong block number. | Require the requested hash to match both transaction and receipt, consistent transaction/receipt block number and hash, and the requested block number in the canonical block response. Inconsistent RPC data cannot link a wallet. Existing proof policy still checks canonical hashes, confirmations and freshness. |

Before applying corrections, regression cases demonstrated **20 failures** against the old behavior. Tests also cover successful multi-page inventory, a consistent mined proof, byte limits with multibyte UTF-8 split across chunks, early cancellation, stalled-body cancellation, and unchanged stored credentials when validation fails.

The inventory contract was checked against the [Alchemy NFT ownership reference](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3) and [Alchemy's API field reference](https://github.com/alchemyplatform/skills/blob/main/skills/alchemy-api/references/data-nft-api.md). `totalCount` describes tokens across pages, while an ERC-1155 token's `balance` describes its copies. A transfer changing the reported total while paginating causes a retry rather than a role update from inconsistent data.

## Validation

- Initial `npm run check`: 146 tests passed; 9 PostgreSQL integration tests skipped locally without a test database. Typecheck, formatting and build passed.
- Corrected `npm run check`: 176 tests passed; the same 9 database integration tests skipped locally. Typecheck, formatting and build passed.
- No migration or command registration changes are required for these corrections.
- GitHub CI additionally runs all tests against PostgreSQL 17, applies migrations twice, and builds Docker. Its final status is available on the correction PR.
- Live Discord/Alchemy behavior is not exercised by the mocked tests.

## Remaining product gaps

- **ERC-20 is not implemented.** Current ownership rules and providers support ERC-721 and ERC-1155 only; the README explicitly defers ERC-20. Supporting it requires token standards in rules, integer balances/decimals policy, RPC balance reads and corresponding tests.
- **PR #6 is still open.** `main` currently remains at `93477ea9e6bf91dd6b6cb9d06683010439fe8c6a`. This review does not merge or deploy the Alchemy configuration or its corrections.
- The existing single-replica restriction and production acceptance requirement still apply. Encryption-key rotation, data retention/privacy and operational monitoring remain outside this corrective change.
