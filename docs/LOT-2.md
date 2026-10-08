# Lot 2 — wallet verification

## Scope

English guild-only `/wallet add`, `list`, `remove` and `verify`. Address entry uses a Discord modal; instructions, status and errors are ephemeral. A button opens the transaction-hash modal. No browser, signatures, spending approvals or keys are requested. RPC calls are read-only.

Challenges and wallet associations persist in PostgreSQL. Proof acceptance requires matching chain, hash, sender/recipient, exact native amount, empty calldata, successful receipt, matching canonical block hashes, fresh block/timestamp and sufficient confirmations. Every amount is generated with cryptographic randomness and stored as a decimal integer string. No floating-point conversion is used.

## Explicit policies

- Ethereum 1 and Polygon 137; HTTPS RPC URLs are configurable server-side.
- Ten-minute window includes mining, confirmations and user submission. Ethereum: 12 confirmations; Polygon: 64. No claim of absolute finality.
- Standard externally owned wallets only; addresses with non-empty code are rejected.
- Five wallets per guild/member; active address uniqueness per guild.
- One pending challenge per member and per address in a guild, enforced by partial unique indexes. A new challenge cancels the old one after the one-minute cooldown.
- Persistent creation limits: one per minute, ten per hour. In-memory interactive limit: ten requests per user/minute across guilds; ten concurrent service requests; bounded rate-limit map.
- User submits the hash instead of automatic chain scanning. Missing receipts/provider failures do not verify a wallet.
- Replay constraints survive wallet removal. Removed wallets are deactivated, not erased.
- No roles are managed yet; role refresh on wallet changes belongs to Lot 3.

## Concurrency and isolation

Parameterized PostgreSQL advisory transaction locks serialize operations per guild/member. Partial indexes reserve addresses across competing members/networks. The proof consumption and wallet association commit together. Failure, double submission, expiry or transaction-hash reuse rolls back the transaction. All user-facing queries include current guild and user IDs, never values supplied by the user as an ownership claim.

The Lot 1 concurrency failure was reproduced by its PostgreSQL CI test and corrected using `createMany` with `skipDuplicates` for guild settings. The updated Lot 1 CI passes including the PostgreSQL test and Docker build.

## Validation

Local: 49 unit tests pass; generation, typecheck, formatting and build pass. PostgreSQL integration cases run in CI: competing address reservations, double proof consumption, cross-guild/user isolation, removal, hash replay after removal, rollback, expiry, cooldown and wallet limits. No live Discord or paid Alchemy/mainnet transaction was performed.

## Before live acceptance

Populate `.env` locally; run migrations and register commands again. Test one real self-transfer on a test Discord server using a wallet with a small balance. Never provide a token or private key in chat. Review gas costs, practical wallet decimal precision and confirmation timing. Dependency advisories from Lot 1 remain tracked; commercial hardening, privacy retention and sybil/abusive reservation defenses remain future acceptance work.
