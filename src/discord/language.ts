import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { RoleError } from "../roles/domain.js";
import { GuildGate } from "../roles/gate.js";
import { supportedLanguage, t, type Language } from "./i18n.js";

export type LanguageStore = {
  load(): Promise<{ guildId: string; language: string }[]>;
  save(guildId: string, language: Language): Promise<void>;
};

export function createLanguageStore(db: PrismaClient): LanguageStore {
  return {
    load: () =>
      db.guildSettings.findMany({
        where: { language: "fr" },
        select: { guildId: true, language: true },
      }),
    async save(guildId, language) {
      await db.guildSettings.upsert({
        where: { guildId },
        create: { guildId, language },
        update: { language },
      });
    },
  };
}

// Loaded before Discord login. Locale resolution never delays showModal with I/O.
// Settings writes are serialized; update the cache only after durable persistence.
export class LanguageSettings {
  private readonly frenchGuilds = new Set<string>();
  private readonly gate = new GuildGate();
  constructor(private readonly store: LanguageStore) {}
  async load() {
    const rows = await this.store.load();
    this.frenchGuilds.clear();
    for (const row of rows)
      if (row.language === "fr") this.frenchGuilds.add(row.guildId);
  }
  guildLanguage(guildId?: string | null): Language {
    return guildId && this.frenchGuilds.has(guildId) ? "fr" : "en";
  }
  forInteraction(interaction: {
    locale?: string;
    guildId?: string | null;
  }): Language {
    return (
      supportedLanguage(interaction.locale) ??
      this.guildLanguage(interaction.guildId)
    );
  }
  async save(guildId: string, language: Language) {
    // Validate at runtime too: untrusted Discord option values must never enter storage.
    if (language !== "en" && language !== "fr")
      throw new RoleError("invalidRule");
    await this.gate.run(guildId, async () => {
      await this.store.save(guildId, language);
      if (language === "fr") this.frenchGuilds.add(guildId);
      else this.frenchGuilds.delete(guildId);
    });
  }
}

export async function languageCommand(
  interaction: ChatInputCommandInteraction,
  settings: LanguageSettings,
) {
  if (
    !interaction.guildId ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  )
    throw new RoleError("adminOnly");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const language = interaction.options.getString("language", true);
  if (language !== "en" && language !== "fr")
    throw new RoleError("invalidRule");
  await settings.save(interaction.guildId, language);
  await interaction.editReply(
    t(
      "Server language saved: {0}. Publish a new /panel publish to update public text. Private replies prefer each member's Discord language.",
      language === "fr" ? t("French") : t("English"),
    ),
  );
}
