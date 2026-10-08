CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'VERIFIED', 'CANCELLED', 'EXPIRED');
CREATE TABLE "Wallet" (
  "guildId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("guildId", "address"),
  CHECK ("address" ~ '^0x[0-9a-f]{40}$')
);
CREATE INDEX "Wallet_guildId_userId_active_idx" ON "Wallet" ("guildId", "userId", "active");
CREATE TABLE "WalletChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL,
  "amountWei" TEXT NOT NULL,
  "startBlock" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "transactionHash" TEXT,
  CHECK ("address" ~ '^0x[0-9a-f]{40}$'),
  CHECK ("chainId" IN (1, 137)),
  CHECK ("amountWei" ~ '^[1-9][0-9]{0,17}$'),
  CHECK ("startBlock" >= 0),
  CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "WalletChallenge_chainId_amountWei_key" ON "WalletChallenge" ("chainId", "amountWei");
CREATE UNIQUE INDEX "WalletChallenge_chainId_transactionHash_key" ON "WalletChallenge" ("chainId", "transactionHash");
CREATE INDEX "WalletChallenge_guildId_userId_createdAt_idx" ON "WalletChallenge" ("guildId", "userId", "createdAt");
CREATE INDEX "WalletChallenge_status_expiresAt_idx" ON "WalletChallenge" ("status", "expiresAt");
-- Reservations cannot overlap even if requests arrive concurrently or on different networks.
CREATE UNIQUE INDEX "WalletChallenge_pending_member_key" ON "WalletChallenge" ("guildId", "userId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "WalletChallenge_pending_address_key" ON "WalletChallenge" ("guildId", "address") WHERE "status" = 'PENDING';
