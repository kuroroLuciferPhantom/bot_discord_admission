# Discord Holder Bot

Multi-server NFT role bot. English commands, no wallet connection, no signing request, no spending approvals.

## Current status — Lots 1–6

Implemented: private wallet verification, ERC-1155/ERC-721 counts through Alchemy, admin rules/settings, manual role refresh, automatic refresh on verified wallet changes, durable scheduled checks and retries, dormant members, server-scoped storage, migrations, Docker Compose and CI.

**Not implemented yet:** operational/commercial hardening. A real Discord/Alchemy acceptance test is still required before production. The scheduler is disabled by default until that acceptance test.

## Requirements

Node.js 24.19+, npm, PostgreSQL 17, a Discord application and a dedicated test server. Docker is optional for local development.

1. Copy `.env.example` to `.env` and fill it locally. Never share or commit secrets.
2. Run `npm ci`, then `npm run db:generate`.
3. Set `DATABASE_URL` to your local PostgreSQL database and run `npm run db:migrate`.
4. Set the application ID, bot token and test guild ID.
5. Run `npm run commands:deploy -- --guild`.
6. Start with `npm run dev`. Try `/help` in the test server.

## Wallet verification

### Button-first member experience

An administrator runs `/panel publish` in the member channel once. The bot posts a public English membership card with **Verify wallet**, **My wallets**, **Refresh roles** and **My status** buttons. The panel contains no private data; every member action replies privately and uses the clicking member's account and server. Buttons survive process restarts without collectors. `/help` also offers the same buttons in a private reply. Redeploy commands after upgrading; no new database migration is needed for this panel.

**Verify wallet** opens a private network choice, then an address form. Proof instructions include a **Submit transaction** button and hash form. **My wallets** lists addresses with numbered removal buttons and restores any pending challenge. Removal requires confirmation and refreshes eligibility. **Refresh roles** claims eligible roles. **My status** shows live quantities and configured tiers without changing roles or reactivating dormant members. Status and refresh share the existing one-minute API cooldown. Wallet list and mutations retain the existing verifier limits.

Only panel publication is public, and it requires Administrator at registration and runtime. Slash commands remain available as a fallback. The bot does not track panel message IDs or automatically update old cards; to replace a panel, delete the old message in Discord and publish again. Discord embeds and standard components are used, not a separate website. A live Discord acceptance test of layouts, permissions and private replies is still required.

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

### Private per-server Alchemy configuration

The host owner can enable encrypted server keys by setting `ALCHEMY_ENCRYPTION_KEY` to 32 random bytes encoded in canonical Base64. Generate it locally with `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"`, copy directly into the host's `.env`, and never share or commit its output. Recreate the bot container after changing host environment variables. Apply the Lot 6 migration and redeploy commands before using this feature.

Server administrators run `/settings alchemy` to open a **blank private modal**, not pass a key as a slash-command argument. Submission rechecks Administrator and tests Ethereum/Polygon mainnet RPC plus NFT access before replacing any configuration. Replies never show the key. `/settings alchemy-status` shows configuration presence only; it does not decrypt the saved key. `/settings alchemy-remove confirm:true` deletes this server's override and restores host fallback. Deletion does not revoke the key at Alchemy.

Keys are stored as randomized AES-256-GCM ciphertext authenticated to their guild ID. The master secret exists only on the host. Save it securely **separately from database backups**: losing/changing it makes saved keys unreadable. No master-key rotation workflow is provided yet; do not replace it casually. Authorized admins can recover a server by replacing its key or explicitly removing its override. Plaintext keys necessarily pass through Discord and process memory: private is not end-to-end encrypted, and Discord may retain interaction data. Never enter recovery phrases or wallet private keys. Alchemy application restrictions must permit the bot host; restrict access and budget quotas in Alchemy.

A saved server key takes precedence for both NFT reads and wallet-proof RPC on both networks, without a restart. Only servers with **no saved override** use `ALCHEMY_API_KEY` (NFT) and `ETHEREUM_RPC_URL` / `POLYGON_RPC_URL` (proofs) from the host. A locked/invalid/unavailable override never silently falls back to the host key. API failures preserve roles and queue retries as before. Host fallback is a shared quota/cost decision; leave those variables unset if clients must always provide their own keys. Key validation attempts share the guild gate and are limited to once per minute per server (in memory, resets on restart). Validation makes up to four read-only calls; it proves current access, not future quota availability. No host secret is modifiable from Discord.

```text
/rules add group:apes network:polygon contract:0x… minimum:5 role:@Holder
/rules add group:apes network:polygon contract:0x… minimum:20 role:@BigHolder
/rules list page:1
/rules edit id:… group:apes network:polygon contract:0x… minimum:25 role:@BigHolder
/rules remove id:…
/settings role-stacking enabled:false
/settings check-frequency times-per-week:2
/settings status
/roles refresh
```

Rules can use optional `token-ids:1,2,3` (decimal or hexadecimal IDs). Omit it to count the whole collection. `edit` replaces the full rule, including its filter. `/rules list` displays five rules per page with an attached JSON file containing exact filter IDs.

With stacking on, every eligible threshold applies. With stacking off, only the highest eligible threshold **per group** applies. A group must use the same network, contract and normalized token-ID selection. Roles are unique per server rule; thresholds are unique within a group. Counts use integer copies for ERC-1155 and unique NFTs for ERC-721, summed over verified addresses. A duplicate ERC-721 reported on two wallets is treated as inconsistent provider data and preserves roles.

`/roles refresh` is private and checks only the invoking member. Successful wallet verification and wallet removal also request a refresh. If that fails, the wallet change remains saved and the user is told to retry. Rule/settings edits apply on each member's next refresh. Removing or editing a rule retains its old role in a management registry so stale roles can be cleaned up; unrelated roles are never changed.

The bot refuses managed roles, @everyone, roles above/equal to itself and administrative/moderation roles. Role operations use individual add/remove calls, never replace the member's entire role list. Additions run before removals; Discord updates are not atomic, so partial failures are reported and can be reconciled by another refresh.

Alchemy queries are contract-filtered, metadata-free and paginated. Failed, malformed, duplicated or truncated responses do not cause any role changes. There is a thirty-second inventory deadline, ten pages maximum per wallet/contract, twenty rules per server and a manual refresh cooldown of one minute. Counts rely on Alchemy's indexed ownership view, not an atomic multi-wallet block snapshot: recently transferred ERC-1155s can temporarily appear stale. Avoid promising instantaneous on-chain finality; live acceptance must check indexing behavior.

**Run one bot replica.** A shared per-guild in-process gate prevents config/wallet mutations during a refresh; independent guilds can proceed with bounded concurrency. Database job leases are not a substitute for multi-replica coordination of role/config/wallet effects.

## Scheduled checks

After applying migrations and testing on a dedicated Discord server, set `SCHEDULER_ENABLED=true` and restart the bot. `/settings check-frequency times-per-week:1` or `2` sets a rolling interval of seven days or three-and-a-half days after a successful check, not fixed calendar weekdays. `/settings status` is admin-only and shows scheduler enablement, active/dormant members, due checks, retries and the latest successful check.

Only members registered by a role refresh are considered. Before reading Alchemy, scheduled checks fetch current Discord roles. Members with no managed roles or confirmed departed members become dormant: no further wallet polling until a successful `/roles refresh` (or refresh on wallet change) makes them eligible again. Dormant records and verified addresses remain stored; this is not privacy erasure. Existing holders who never ran a refresh are not automatically discovered.

Scheduled checks **only remove** ineligible or obsolete managed roles. They never grant, promote, regrant or downgrade into an unheld tier. With stacking disabled, the highest eligible _currently held_ tier remains. Use `/roles refresh` to claim new roles. Config edits are evaluated on the next check or refresh, not broadcast immediately to all members.

Due dates, five-minute claim leases and retry state persist in PostgreSQL. Startup resumes due work; expired leases are recoverable. The worker handles at most five jobs sequentially per batch, polling every minute, so backlogs can delay checks. API and partial Discord failures retry after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, then at most once daily; permission errors retry hourly, busy/config races after one minute. Failed checks preserve roles unless Discord already performed some individual removals before a partial failure. An interrupted check is reconciled after its lease expires. A failed wallet-change refresh queues an existing active holder for reconciliation but does not automatically reawaken a dormant member.

Changing frequency reschedules future regular checks for that server without delaying overdue checks, retry timers or in-flight leases. Stopping or disabling the scheduler does not erase its queue. Graceful shutdown waits for the current job for up to the process's ten-second shutdown deadline; forced termination leaves an expiring lease. Logs use fixed event/error codes without wallet addresses or raw provider errors. External monitoring, alerting and a production runbook remain to be implemented.

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
- ERC-1155 first, ERC-721 supported. ERC-20 deferred.
- Sum quantities over a member's verified wallets. ERC-1155 counts copies, not distinct IDs; rules can select IDs or the whole contract.
- Admin-only rules: network, contract, minimum quantity, role and tier group. Stacking is configurable; non-stacking selects the highest eligible tier **within a group**, never across unrelated collections.
- Check active role holders one or two times weekly. Members with no managed roles become dormant; `/roles refresh` reactivates them when eligible.
- An RPC/API error is not evidence of lost ownership: preserve roles and retry.
- Server data is isolated by guild ID. Active wallet uniqueness is enforced per guild; a wallet may join independent communities with separate proofs.
- No dashboard, billing, marketplace or distributed queue in the MVP.

Implemented wallet, role and periodic-check behavior and limitations are described above.

## Structure and next lots

`src/discord` holds interactions and English text; `src/storage.ts` holds persistence; `src/config.ts` validates runtime configuration. Prisma generates code into ignored `src/generated`.

`src/wallets` separates proof policy, read-only RPC, transactional persistence and service limits. `src/roles` separates holdings, rule evaluation, storage and Discord effects. `src/jobs` separates durable claims, retry policy and bounded scheduling. Future modules should remain in this one deployable service until scaling creates a real need to split them.

Before commercial release: verify data retention/privacy, RPC quotas and costs, backups, operational monitoring and multi-server authorization tests.
