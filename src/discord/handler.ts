import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { SettingsStore } from "../storage.js";
import { messages } from "./messages.js";

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore,
  reportFailure: () => void,
) {
  try {
    if (!interaction.guildId) {
      await interaction.reply({
        content: messages.en.guildOnly,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.commandName !== "help") {
      await interaction.editReply(messages.en.unavailable);
      return;
    }
    await store.ensureGuild(interaction.guildId);
    await interaction.editReply(messages.en.help);
  } catch {
    reportFailure();
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(messages.en.error);
      } else {
        await interaction.reply({
          content: messages.en.error,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      // Expired interactions must not crash the process or leak raw SDK errors.
      reportFailure();
    }
  }
}
