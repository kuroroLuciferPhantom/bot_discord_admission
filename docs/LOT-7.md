# Lot 7 — ERC-20 holder roles

## Behavior

English `/rules add` and `/rules edit` now accept optional `asset-type:nft|erc20`; omitting it retains NFT behavior. Administrators enter positive ERC-20 thresholds in token units, including fractions such as `100.5`. The bot reads the contract's `decimals()` and stores a canonical integer base-unit threshold. It rejects excess precision, scientific notation, overflow and NFT token-ID filters on token rules.

ERC-20 reads use Ethereum/Polygon RPC with the same encrypted per-guild override and strict fallback behavior as wallet proofs. Each contract's verified wallets are read at one canonical block hash with EIP-1898. A failed or malformed read, changed metadata or reorg cannot become a zero balance. Zero balances are accepted only from an actual successful 32-byte ABI response. All roles are preserved until every required NFT/ERC-20 source succeeds. No transfers or approvals are sent.

Manual refresh, wallet-change refresh, read-only member status, stacking and scheduled removal-only checks share the existing eligibility engine. NFT and ERC-20 inventory keys are distinct, even for identical contract addresses. Tier groups cannot mix asset types or decimals. Queries are shared across tiers for a source, and duplicate verified addresses are counted once.

Token quantities are shown in human units. Private rule/status JSON exports keep exact raw quantities and decimals; oversized status displays export all rules within Discord's embed limits. Public member panels use generic holder wording and retain restart-safe buttons.

## Persistence and upgrade

Migration `20261012000000_erc20_rules` adds `RuleAssetType` and nullable decimals. Existing rows receive `NFT` automatically. A database constraint requires NFT rules to have no token precision, and ERC-20 rules to have precision 0–255 and an empty ID filter. Existing threshold and role uniqueness constraints remain.

Apply `npm run db:migrate` and re-register commands with `npm run commands:deploy -- --guild` or the authorized global deployment workflow before using the new option. Republish the public panel if its old NFT-only text should change. No host secret or token address is changed automatically.

## Validation and limits

Tests cover fractional thresholds (0/6/18/255 decimals), values beyond JavaScript safe integers, ABI errors, empty versus real zero replies, network mismatches, immutable snapshot parameters, canonical-block errors, large contract code, both networks, mixed NFT/token roles, provider failures, scheduled removal, read-only status, command options, credential fallback isolation and database constraints. GitHub CI applies migrations twice to PostgreSQL 17, runs all integration tests, typechecks, checks formatting, audits dependencies and builds Docker.

A live Discord/Alchemy acceptance test is still needed. This release supports tokens exposing the optional `decimals()` metadata method and RPC providers supporting EIP-1898. Unsupported metadata or endpoint capabilities produce a provider error; there is no guessed precision or silently weaker snapshot fallback. NFT indexing retains its previous eventual-consistency limitations. The one-replica restriction remains.

References: [EIP-20](https://eips.ethereum.org/EIPS/eip-20) and [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898).
