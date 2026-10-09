import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { AlchemyError, apiKey, type AlchemyVault } from "../alchemy/vault.js";
import { validateKey } from "../alchemy/providers.js";
import { GuildGate } from "../roles/gate.js";
import { RoleError } from "../roles/domain.js";

export function alchemyErrorMessage(error: AlchemyError) {
  return {
    disabled:
      "The bot owner must configure ALCHEMY_ENCRYPTION_KEY on the host before server keys can be saved.",
    invalid:
      "Enter an Alchemy API key only, not an endpoint URL. No spaces or special characters.",
    unavailable:
      "The key could not be validated for Ethereum and Polygon RPC/NFT access. Check access, quotas and network availability. Your previous configuration was not changed.",
    locked:
      "The saved key cannot be decrypted. Contact the bot owner. Global fallback will not be used for this saved configuration.",
  }[error.code];
}
export class AlchemySettings {
  private readonly cooldown = new Map<string, number>();
  constructor(
    public readonly vault: AlchemyVault,
    private readonly gate: GuildGate,
    private readonly validate = validateKey,
    private readonly clock = Date.now,
  ) {}
  async save(guildId: string, input: string) {
    if (!this.vault.enabled) throw new AlchemyError("disabled");
    const key = apiKey(input);
    return this.gate.run(guildId, async () => {
      const now = this.clock();
      for (const [guild, until] of this.cooldown)
        if (until <= now) this.cooldown.delete(guild);
      if (
        (this.cooldown.get(guildId) ?? 0) > now ||
        this.cooldown.size >= 10000
      )
        throw new RoleError("busy");
      this.cooldown.set(guildId, now + 60000);
      await this.validate(key);
      await this.vault.save(guildId, key);
    });
  }
  async remove(guildId: string) {
    return this.gate.run(guildId, () => this.vault.remove(guildId));
  }
}
function admin(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
) {
  if (
    !interaction.guildId ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  )
    throw new RoleError("adminOnly");
  return interaction.guildId;
}
export async function alchemyCommand(
  interaction: ChatInputCommandInteraction,
  settings: AlchemySettings,
) {
  const guildId = admin(interaction),
    sub = interaction.options.getSubcommand();
  if (sub === "alchemy") {
    if (!settings.vault.enabled) throw new AlchemyError("disabled");
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("alchemy:save")
        .setTitle("Server Alchemy API key")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("api-key")
              .setLabel("API key (private; processed by Discord)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(1)
              .setMaxLength(200),
          ),
        ),
    );
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (sub === "alchemy-status") {
    const configured = await settings.vault.configured(guildId);
    await interaction.editReply(
      `Server Alchemy key: ${configured ? "configured" : "not configured; host fallback applies if available"}.\nEncrypted storage: ${settings.vault.enabled ? "enabled" : "disabled"}.\nSaved keys are never displayed. A saved key takes precedence for NFT checks and wallet proofs on Ethereum and Polygon.`,
    );
  } else if (sub === "alchemy-remove") {
    if (!interaction.options.getBoolean("confirm", true))
      throw new AlchemyError("invalid");
    await settings.remove(guildId);
    await interaction.editReply(
      "Server key removed. Host fallback applies if available. The key was not revoked at Alchemy; revoke it there if needed.",
    );
  } else throw new AlchemyError("invalid");
}
export async function alchemyModal(
  interaction: ModalSubmitInteraction,
  settings: AlchemySettings,
) {
  const guildId = admin(interaction);
  if (interaction.customId !== "alchemy:save")
    throw new AlchemyError("invalid");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await settings.save(guildId, interaction.fields.getTextInputValue("api-key"));
  await interaction.editReply(
    "Alchemy key validated and saved encrypted for this server. Ethereum and Polygon NFT checks and wallet proofs now use this key. It will never be displayed. No restart is required.",
  );
}
