ALTER TABLE "GuildSettings" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "RoleRule" (
  "id" TEXT PRIMARY KEY, "guildId" TEXT NOT NULL, "group" TEXT NOT NULL,
  "chainId" INTEGER NOT NULL CHECK ("chainId" IN (1,137)), "contract" TEXT NOT NULL CHECK ("contract" ~ '^0x[0-9a-f]{40}$'),
  "tokenIds" TEXT[] NOT NULL, "minimum" TEXT NOT NULL CHECK ("minimum" ~ '^[1-9][0-9]{0,77}$'), "roleId" TEXT NOT NULL
);
CREATE UNIQUE INDEX "RoleRule_guildId_roleId_key" ON "RoleRule" ("guildId", "roleId");
CREATE UNIQUE INDEX "RoleRule_guildId_group_minimum_key" ON "RoleRule" ("guildId", "group", "minimum");
CREATE INDEX "RoleRule_guildId_idx" ON "RoleRule" ("guildId");
CREATE TABLE "ManagedRole" ("guildId" TEXT NOT NULL, "roleId" TEXT NOT NULL, PRIMARY KEY ("guildId", "roleId"));
CREATE TABLE "RoleMember" ("guildId" TEXT NOT NULL, "userId" TEXT NOT NULL, "lastCheckedAt" TIMESTAMP(3), "active" BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY ("guildId", "userId"));
