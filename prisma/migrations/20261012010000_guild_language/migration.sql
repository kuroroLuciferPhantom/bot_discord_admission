ALTER TABLE "GuildSettings" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_language_check"
  CHECK ("language" IN ('en', 'fr'));
