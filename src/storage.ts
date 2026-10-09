import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export function createDatabase(connectionString: string) {
  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 10_000,
    max: 5,
  });
  return new PrismaClient({ adapter });
}

export type SettingsStore = {
  ensureGuild(guildId: string): Promise<void>;
};

export function createSettingsStore(db: PrismaClient): SettingsStore {
  return {
    async ensureGuild(guildId) {
      await db.guildSettings.createMany({
        data: [{ guildId }],
        skipDuplicates: true,
      });
    },
  };
}
