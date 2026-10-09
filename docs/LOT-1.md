# Lot 1 — foundation

## Delivered

- TypeScript strict, Node 24, discord.js, pinned dependencies and lockfile.
- Guild-only `/help`, always ephemeral, with immediate acknowledgement before database work.
- Server-scoped, idempotent settings persistence; initial migration and frequency constraint.
- Centralized English messages, explicit guild/global command deployment.
- Startup database/schema check, sanitized error output and graceful termination.
- Docker Compose with private database, persistent volume and migration ordering.
- Unit tests and an opt-in PostgreSQL integration test, wired into CI.

## Verification

Local `npm run check`: successful generation, typecheck, 16 unit tests, formatting and production build.

The PostgreSQL integration test is skipped locally because no PostgreSQL server is available. It uses only `TEST_DATABASE_URL`, never the runtime database URL, and is enabled in CI after migrations. Docker is not installed in the development environment; CI builds the image. Discord has not been contacted: credentials and a test guild must be configured by the owner.

## Dependency audit

Initial npm audit flags high-severity advisories in Prisma CLI's transitive `deepmerge-ts` and `mysql2` dependencies. This bot uses PostgreSQL, not MySQL, and does not merge user-supplied recursive configuration, but this does not make the advisories disappear. Do not run `npm audit fix --force`: its proposed downgrade changes the Prisma major version. Track an upstream fix or separately validate dependency overrides before production release. The current Docker image retains CLI tooling for migrations and is a foundation image, not a hardened commercial release.

## Not delivered in this lot

Wallet challenges, on-chain reads, NFT inventory, role rules, authorization for admin commands, role syncing and durable periodic jobs. No fake endpoints or placeholder commands expose these capabilities. Alchemy credentials are deliberately not required until the integration exists.

## Next acceptance gate

Green CI and a real `/help` interaction in a test guild. Then implement Lot 2 with challenge persistence, exact integer amounts, bounded validity, successful transaction receipt, confirmation policy, replay prevention and address uniqueness per guild. Native self-transfer verification for smart-contract wallets needs an explicit supported/unsupported policy before accepting them.
