# Discord Holder Bot

Multi-server NFT role bot. English commands, no wallet connection, no signing request, no spending approvals.

## Current status — Lots 1–3

Implemented: private wallet verification, ERC-1155/ERC-721 counts through Alchemy, admin rules/settings, manual role refresh, automatic refresh on verified wallet changes, server-scoped storage, migrations, Docker Compose and CI.

**Not implemented yet:** periodic jobs and operational/commercial hardening. A real Discord/Alchemy acceptance test is still required before production.

## Requirements

Node.js 24.19+, npm, PostgreSQL 17, a Discord application and a dedicated test server. Docker is optional for local development.

1. Copy `.env.example` to `.env` and fill it locally. Never share or commit secrets.
2. Run `npm ci`, then `npm run db:generate`.
3. Set `DATABASE_URL` to your local PostgreSQL database and run `npm run db:migrate`.
4. Set the application ID, bot token and test guild ID.
5. Run `npm run commands:deploy -- --guild`.
6. Start with `npm run dev`. Try `/help` in the test server.

## Wallet verification

Configure one or both HTTPS RPC endpoints in `.env`: `ETHEREUM_RPC_URL` and `POLYGON_RPC_URL`. Use your Alchemy mainnet endpoints. A missing endpoint disables proof creation on that network without breaking `/help` or wallet management.

1. `/wallet add network:polygon` opens a private address modal.
2. The bot displays the exact native amount, the same address as sender/recipient, expiry and a transaction-submission button.
3. Send the exact amount from your own wallet to itself; leave calldata empty. Native POL on Polygon or ETH on Ethereum only. Do not round, use an exchange withdrawal or send money to the bot. Gas is spent; the transferred amount stays in your wallet.
4. Submit the transaction hash with the button or `/wallet verify challenge:… transaction:…`. If confirmations are insufficient, retry before expiry.
5. `/wallet list` restores your pending instructions after a restart. `/wallet remove address:…` deactivates your own address and cancels its pending challenge.

Proof acceptance requires a successful, canonical transaction in a block strictly after challenge creation's chain snapshot, with inclusion timestamp inside the ten-minute window. This preview requires **12 Ethereum / 64 Polygon confirmations and submission before expiry**. This is a confirmation policy, not guaranteed chain finality; send promptly. No automatic polling, transaction submission or wallet connection occurs.

Standard externally owned addresses only: contracts and delegated wallets (including accounts with non-empty code) are refused at challenge creation. Five verified wallets maximum per member per server; one pending challenge per member; one pending reservation per address in a server; at most one new challenge per minute and ten per hour. Interactive requests have additional bounded concurrency and per-user rate limits.

Proof hashes and challenge amounts remain single-use across the deployment, including after wallet removal. Addresses are unique among active members within a server, but can belong to the same holder in independent servers with separate proofs. Removing a wallet is currently a **deactivation**, not privacy erasure: proof history is retained for replay protection. A retention/erasure policy is required before commercial release.

Invite the application with `bot` and `applications.commands` scopes. No privileged gateway intents are needed. Grant **Manage Roles**, and place the bot above every role it manages. Do not grant Administrator to the bot. Rules/settings require the invoking member to have Administrator, checked both at registration and runtime.

## NFT roles and administration

Configure `ALCHEMY_API_KEY` with Ethereum and Polygon NFT API access. Register commands again after upgrading and apply all migrations before starting the bot.

```text
/rules add group:apes network:polygon contract:0x… minimum:5 role:@Holder
/rules add group:apes network:polygon contract:0x… minimum:20 role:@BigHolder
/rules list page:1
/rules edit id:… group:apes network:polygon contract:0x… minimum:25 role:@BigHolder
/rules remove id:…
/settings role-stacking enabled:false
/settings check-frequency times-per-week:2
/roles refresh
```

Rules can use optional `token-ids:1,2,3` (decimal or hexadecimal IDs). Omit it to count the whole collection. `edit` replaces the full rule, including its filter. `/rules list` displays five rules per page with an attached JSON file containing exact filter IDs.

With stacking on, every eligible threshold applies. With stacking off, only the highest eligible threshold **per group** applies. A group must use the same network, contract and normalized token-ID selection. Roles are unique per server rule; thresholds are unique within a group. Counts use integer copies for ERC-1155 and unique NFTs for ERC-721, summed over verified addresses. A duplicate ERC-721 reported on two wallets is treated as inconsistent provider data and preserves roles.

`/roles refresh` is private and checks only the invoking member. Successful wallet verification and wallet removal also request a refresh. If that fails, the wallet change remains saved and the user is told to retry. Rule/settings edits apply on each member's next refresh. Removing or editing a rule retains its old role in a management registry so stale roles can be cleaned up; unrelated roles are never changed.

The bot refuses managed roles, @everyone, roles above/equal to itself and administrative/moderation roles. Role operations use individual add/remove calls, never replace the member's entire role list. Additions run before removals; Discord updates are not atomic, so partial failures are reported and can be reconciled by another refresh.

Alchemy queries are contract-filtered, metadata-free and paginated. Failed, malformed, duplicated or truncated responses do not cause any role changes. There is a thirty-second inventory deadline, ten pages maximum per wallet/contract, twenty rules per server and a manual refresh cooldown of one minute. Counts rely on Alchemy's indexed ownership view, not an atomic multi-wallet block snapshot: recently transferred ERC-1155s can temporarily appear stale. Avoid promising instantaneous on-chain finality; live acceptance must check indexing behavior.

**Run one bot replica.** A shared per-guild in-process gate prevents config/wallet mutations during a refresh; independent guilds can proceed with bounded concurrency. Multi-replica coordination is not implemented. `/settings check-frequency` saves the desired frequency but does not enable a scheduler yet.

Command deployment **replaces this application's commands in the selected scope**. Use a dedicated application; global registration requires the explicit `--global` flag. Commands are never registered automatically at startup.

## Docker

Set `POSTGRES_PASSWORD` and use `DATABASE_URL=postgresql://holder:<password>@db:5432/holder` in `.env` (URL-encode special password characters).

Run `docker compose up --build -d`. PostgreSQL is not exposed to the host. The migration service must succeed before the bot starts. Register test commands from a local checkout, or run:

```sh
docker compose run --rm -e DISCORD_TEST_GUILD_ID=YOUR_GUILD_ID bot node dist/discord/deploy.js --guild
```

Use `docker compose logs --tail=100 bot` to inspect startup. Database data lives in a named volume; back it up before upgrades. Do not use `docker compose down -v` unless you intend to delete it.

## Quality checks

`npm run check` generates Prisma, typechecks, runs unit tests, checks formatting and builds. CI also applies migrations twice to a fresh PostgreSQL instance, runs integration tests using the dedicated `TEST_DATABASE_URL`, and builds Docker. External Discord/Alchemy calls are not performed by tests. Never set `TEST_DATABASE_URL` to a live database: integration fixtures insert and delete test rows.

## Product decisions

- Self-transfer proof: Ethereum or Polygon, challenge valid for ten minutes. Native coin only; transaction must be successful, fresh and single-use.
- ERC-1155 first, ERC-721 supported by the planned holdings adapter. ERC-20 deferred.
- Sum quantities over a member's verified wallets. ERC-1155 counts copies, not distinct IDs; rules can select IDs or the whole contract.
- Admin-only rules: network, contract, minimum quantity, role and tier group. Stacking is configurable; non-stacking selects the highest eligible tier **within a group**, never across unrelated collections.
- Check active role holders one or two times weekly. Members with no managed roles become dormant; `/roles refresh` reactivates them when eligible.
- An RPC/API error is not evidence of lost ownership: preserve roles and retry.
- Server data is isolated by guild ID. Wallet uniqueness is enforced per guild in the next lot; a wallet may join independent communities.
- No dashboard, billing, marketplace or distributed queue in the MVP.

Periodic-check decisions are the baseline for Lot 4. Implemented wallet and role behavior and limitations are described above.

## Structure and next lots

`src/discord` holds interactions and English text; `src/storage.ts` holds persistence; `src/config.ts` validates runtime configuration. Prisma generates code into ignored `src/generated`.

`src/wallets` separates proof policy, read-only RPC, transactional persistence and service limits. `src/roles` separates holdings, rule evaluation, storage and Discord effects. Lot 4 adds durable scheduled jobs, retry policies and operational acceptance. Future modules should remain in this one deployable service until scaling creates a real need to split them.

Before commercial release: verify data retention/privacy, RPC quotas and costs, backups, operational monitoring and multi-server authorization tests.
