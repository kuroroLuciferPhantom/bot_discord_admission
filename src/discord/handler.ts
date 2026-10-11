import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { SettingsStore } from "../storage.js";
import { messages } from "./messages.js";
import type { WalletService } from "../wallets/service.js";
import { walletCommand, walletErrorMessage } from "./wallets.js";
import { WalletError } from "../wallets/domain.js";
import { RoleError } from "../roles/domain.js";
import { roleCommand, roleErrorMessage } from "./roles.js";
import type { RoleService } from "../roles/service.js";
import { panelCommand, memberActions } from "./panel.js";
import {
  alchemyCommand,
  alchemyErrorMessage,
  type AlchemySettings,
} from "./alchemy.js";
import { AlchemyError } from "../alchemy/vault.js";

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  store: SettingsStore,
  reportFailure: () => void,
  wallets?: WalletService,
  roles?: RoleService,
  alchemy?: AlchemySettings,
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
      await walletCommand(interaction, wallets, roles);
      return;
    }
    if (interaction.commandName === "panel") {
      await panelCommand(interaction);
      return;
    }
    if (
      interaction.commandName === "settings" &&
      interaction.options.getSubcommand().startsWith("alchemy") &&
      alchemy
    ) {
      await alchemyCommand(interaction, alchemy);
      return;
    }
    if (
      ["rules", "roles", "settings"].includes(interaction.commandName) &&
      roles
    ) {
      await roleCommand(interaction, roles);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.commandName !== "help") {
      await interaction.editReply(messages.en.unavailable);
      return;
    }
    await store.ensureGuild(interaction.guildId);
    await interaction.editReply({
      content: messages.en.help,
      components: [memberActions()],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (
      !(error instanceof WalletError) &&
      !(error instanceof RoleError) &&
      !(error instanceof AlchemyError)
    )
      reportFailure();
    const content =
      error instanceof AlchemyError
        ? alchemyErrorMessage(error)
        : error instanceof RoleError
          ? roleErrorMessage(error)
          : walletErrorMessage(error);
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
