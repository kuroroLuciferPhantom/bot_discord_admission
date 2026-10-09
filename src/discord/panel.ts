import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { WalletService } from "../wallets/service.js";
import type { RoleService } from "../roles/service.js";
import { RoleError } from "../roles/domain.js";
import { WalletError } from "../wallets/domain.js";
import { addModal, challengeReply, refreshAfterChange } from "./wallets.js";

function button(id: string, label: string, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}
export function memberActions() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("holder:verify", "Verify wallet", ButtonStyle.Primary),
    button("holder:wallets", "My wallets"),
    button("holder:refresh", "Refresh roles", ButtonStyle.Success),
    button("holder:status", "My status"),
  );
}
export function panelReply() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Your NFT membership")
        .setDescription(
          "Verify your wallets and unlock your holder roles.\n\n**1. Verify wallet** — prove ownership with a self-transfer.\n**2. Refresh roles** — claim the roles you qualify for.\n**My wallets** — manage your verified addresses.\n**My status** — view NFT quantities and eligible tiers.",
        )
        .setFooter({
          text: "Private replies • No wallet connection • No signature or spending approval",
        }),
    ],
    components: [memberActions()],
    allowedMentions: { parse: [] as const },
  };
}
export async function panelCommand(interaction: ChatInputCommandInteraction) {
  if (
    !interaction.guildId ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  )
    throw new RoleError("adminOnly");
  // This is the only public reply: no user data, addresses or holdings.
  await interaction.reply(panelReply());
}
export async function panelButton(
  interaction: ButtonInteraction,
  wallets: WalletService,
  roles: RoleService,
) {
  const guildId = interaction.guildId,
    userId = interaction.user.id;
  if (!guildId) throw new WalletError("notFound");
  const id = interaction.customId;
  if (id === "holder:add:1" || id === "holder:add:137") {
    await interaction.showModal(addModal(id === "holder:add:1" ? 1 : 137));
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const common = { allowedMentions: { parse: [] as const } };
  if (id === "holder:verify") {
    await interaction.editReply({
      ...common,
      content:
        "Choose your verification network. Your address and proof will stay private. Self-transfers cost network gas; never send funds to the bot.",
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button("holder:add:1", "Ethereum · ETH"),
          button("holder:add:137", "Polygon · POL"),
        ),
      ],
    });
  } else if (id === "holder:wallets") {
    const result = await wallets.list(guildId, userId);
    const pending = result.pending ? challengeReply(result.pending) : undefined;
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (result.addresses.length)
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...result.addresses.map((address, index) =>
            button(
              `holder:remove:${address}`,
              `Remove wallet ${index + 1}`,
              ButtonStyle.Danger,
            ),
          ),
        ),
      );
    if (pending) components.push(...pending.components);
    components.push(memberActions());
    await interaction.editReply({
      ...common,
      content:
        (result.addresses.length
          ? "**Your verified wallets**\n" +
            result.addresses.map((a, i) => `${i + 1}. \`${a}\``).join("\n")
          : "You have no verified wallets on this server.") +
        (pending ? "\n\n" + pending.content : ""),
      components,
    });
  } else if (/^holder:remove:0x[0-9a-fA-F]{40}$/.test(id)) {
    const address = id.slice("holder:remove:".length);
    // The repository validates guild + clicking user's ownership again on confirmation.
    await interaction.editReply({
      ...common,
      content: `Remove \`${address}\`? This may remove your NFT roles. Proof history is retained; this is not data erasure.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(
            `holder:confirm:${address}`,
            "Confirm removal",
            ButtonStyle.Danger,
          ),
          button("holder:wallets", "Cancel"),
        ),
      ],
    });
  } else if (/^holder:confirm:0x[0-9a-fA-F]{40}$/.test(id)) {
    const removed = await wallets.remove(
      guildId,
      userId,
      id.slice("holder:confirm:".length),
    );
    await interaction.editReply({
      ...common,
      content: removed
        ? "Wallet removed. " +
          (await refreshAfterChange(roles, guildId, userId))
        : "No verified wallet was removed. Any matching pending challenge was cancelled.",
      components: [memberActions()],
    });
  } else if (id === "holder:refresh") {
    const result = await roles.refresh(guildId, userId);
    await interaction.editReply({
      ...common,
      content: result.desired.length
        ? "Roles refreshed: " + result.desired.map((r) => `<@&${r}>`).join(", ")
        : "Roles refreshed. You do not currently qualify for a configured role.",
      components: [memberActions()],
    });
  } else if (id === "holder:status") {
    const result = await roles.inspect(guildId, userId);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Your NFT eligibility")
      .setDescription(
        "Quantities are summed across your verified wallets. This view does not change roles. Use Refresh roles to claim them. Status and refresh share a one-minute cooldown.",
      )
      .setFooter({ text: "Indexed NFT balances may lag recent transfers." });
    if (!result.rules.length)
      embed.setDescription(
        "No NFT role rules have been configured on this server yet.",
      );
    for (const rule of result.rules)
      embed.addFields({
        name: `${rule.group} · ${rule.minimum} NFT`,
        value: `<@&${rule.roleId}> · ${result.counts.get(rule.id) ?? 0n} held · ${result.desired.includes(rule.roleId) ? "Eligible" : "Not selected"}`,
      });
    await interaction.editReply({
      ...common,
      embeds: [embed],
      components: [memberActions()],
    });
  } else throw new WalletError("notFound");
}
