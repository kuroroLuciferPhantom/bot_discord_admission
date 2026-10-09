# Discord Holder Bot

Multi-server NFT role bot. English commands, no wallet connection, no signing request, no spending approvals.

## Current status — Lot 1

Implemented: private `/help`, strict configuration, server-scoped settings, PostgreSQL migration, graceful shutdown, command registration script, unit tests, Docker Compose and CI.

**Not implemented yet:** wallet proof, NFT counting, role management, admin commands, periodic jobs. Do not use this foundation to gate access in production.

## Requirements

Node.js 24.19+, npm, PostgreSQL 17, a Discord application and a dedicated test server. Docker is optional for local development.

1. Copy `.env.example` to `.env` and fill it locally. Never share or commit secrets.
2. Run `npm ci`, then `npm run db:generate`.
3. Set `DATABASE_URL` to your local PostgreSQL database and run `npm run db:migrate`.
4. Set the application ID, bot token and test guild ID.
5. Run `npm run commands:deploy -- --guild`.
6. Start with `npm run dev`. Try `/help` in the test server.

Invite the application with `bot` and `applications.commands` scopes. No privileged gateway intents are needed in this lot. Later, role management will need Manage Roles and a bot role above the roles it manages; do not grant Administrator to the bot.

Command deployment **replaces this application's commands in the selected scope**. Use a dedicated application; global registration requires the explicit `--global` flag. Commands are never registered automatically at startup.

## Docker

Set `POSTGRES_PASSWORD` and use `DATABASE_URL=postgresql://holder:<password>@db:5432/holder` in `.env` (URL-encode special password characters).

Run `docker compose up --build -d`. PostgreSQL is not exposed to the host. The migration service must succeed before the bot starts. Register test commands from a local checkout, or run:

```sh
docker compose run --rm -e DISCORD_TEST_GUILD_ID=YOUR_GUILD_ID bot node dist/discord/deploy.js --guild
```

Use `docker compose logs --tail=100 bot` to inspect startup. Database data lives in a named volume; back it up before upgrades. Do not use `docker compose down -v` unless you intend to delete it.

## Quality checks

`npm run check` generates Prisma, typechecks, runs unit tests, checks formatting and builds. CI also applies migrations twice to a fresh PostgreSQL instance and builds Docker. External Discord/Alchemy calls are not performed by tests.

## Product decisions

- Self-transfer proof: Ethereum or Polygon, challenge valid for ten minutes. Native coin only; transaction must be successful, fresh and single-use.
- ERC-1155 first, ERC-721 supported by the planned holdings adapter. ERC-20 deferred.
- Sum quantities over a member's verified wallets. ERC-1155 counts copies, not distinct IDs; rules can select IDs or the whole contract.
- Admin-only rules: network, contract, minimum quantity, role and tier group. Stacking is configurable; non-stacking selects the highest eligible tier **within a group**, never across unrelated collections.
- Check active role holders one or two times weekly. Members with no managed roles become dormant; `/roles refresh` reactivates them when eligible.
- An RPC/API error is not evidence of lost ownership: preserve roles and retry.
- Server data is isolated by guild ID. Wallet uniqueness is enforced per guild in the next lot; a wallet may join independent communities.
- No dashboard, billing, marketplace or distributed queue in the MVP.

These decisions are the agreed implementation baseline, not a claim that the features already exist.

## Structure and next lots

`src/discord` holds interactions and English text; `src/storage.ts` holds persistence; `src/config.ts` validates runtime configuration. Prisma generates code into ignored `src/generated`.

Lot 2 adds persisted wallets/challenges and transaction verification. Lot 3 adds holdings adapters, tier rules, admin commands and role refresh. Lot 4 adds durable scheduled jobs, quotas, retry policies and live test-server acceptance. Future modules should remain in this one deployable service until scaling creates a real need to split them.

Before commercial release: verify data retention/privacy, RPC quotas and costs, backups, operational monitoring and multi-server authorization tests.
