ALTER TABLE "RoleMember"
  ADD COLUMN "nextCheckAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "leaseId" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  ADD COLUMN "lastError" TEXT;
UPDATE "RoleMember" SET "nextCheckAt" = NULL WHERE NOT "active";
CREATE INDEX "RoleMember_active_nextCheckAt_idx" ON "RoleMember" ("active", "nextCheckAt");
