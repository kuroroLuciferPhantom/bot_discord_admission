import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { SettingsStore } from "../storage.js";
import { messages } from "./messages.js";
import type { WalletService } from "../wallets/service.js";
import { walletCommand, walletErrorMessage } from "./wallets.js";
import { WalletError } from "../wallets/domain.js";

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore,
  reportFailure: () => void,
  wallets?: WalletService,
) {
  try {
    if (!interaction.guildId) {
      await interaction.reply({
        content: messages.en.guildOnly,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (interaction.commandName === "wallet" && wallets) {
      await walletCommand(interaction, wallets);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.commandName !== "help") {
      await interaction.editReply(messages.en.unavailable);
      return;
    }
    await store.ensureGuild(interaction.guildId);
    await interaction.editReply(messages.en.help);
  } catch (error) {
    if (!(error instanceof WalletError)) reportFailure();
    const content = walletErrorMessage(error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(content);
      } else {
        await interaction.reply({
          content,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {
      // Expired interactions must not crash the process or leak raw SDK errors.
      reportFailure();
    }
  }
}
