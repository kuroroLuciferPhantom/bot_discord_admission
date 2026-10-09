CREATE TABLE "GuildSettings" (
  "guildId" TEXT NOT NULL,
  "roleStacking" BOOLEAN NOT NULL DEFAULT true,
  "checksPerWeek" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId"),
  CONSTRAINT "GuildSettings_checksPerWeek_check" CHECK ("checksPerWeek" IN (1, 2))
);
