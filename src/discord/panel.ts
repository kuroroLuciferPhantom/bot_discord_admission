import { t, withLanguage, type Language } from "./i18n.js";
import {
  ActionRowBuilder,
  AttachmentBuilder,
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
import { RoleError, ruleQuantity } from "../roles/domain.js";
import { WalletError } from "../wallets/domain.js";
import { addModal, challengeReply, refreshAfterChange } from "./wallets.js";

function button(id: string, label: string, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}
export function memberActions() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("holder:verify", t("Verify wallet"), ButtonStyle.Primary),
    button("holder:wallets", t("My wallets")),
    button("holder:refresh", t("Refresh roles"), ButtonStyle.Success),
    button("holder:status", t("My status")),
  );
}
export function panelReply() {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t("Your holder membership"))
        .setDescription(
          t(
            "Verify your wallets and unlock your holder roles.\n\n**1. Verify wallet** — prove ownership with a self-transfer.\n**2. Refresh roles** — claim the roles you qualify for.\n**My wallets** — manage your verified addresses.\n**My status** — view NFT and ERC-20 quantities and eligible tiers.",
          ),
        )
        .setFooter({
          text: t(
            "Private replies • No wallet connection • No signature or spending approval",
          ),
        }),
    ],
    components: [memberActions()],
    allowedMentions: { parse: [] as const },
  };
}
export async function panelCommand(
  interaction: ChatInputCommandInteraction,
  language?: Language,
) {
  if (
    !interaction.guildId ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  )
    throw new RoleError("adminOnly");
  // This is the only public reply: no user data, addresses or holdings.
  await interaction.reply(
    language ? withLanguage(language, panelReply) : panelReply(),
  );
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
      content: t(
        "Choose your verification network. Your address and proof will stay private. Self-transfers cost network gas; never send funds to the bot.",
      ),
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
              t("Remove wallet {0}", index + 1),
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
          ? t("**Your verified wallets**\n") +
            result.addresses.map((a, i) => `${i + 1}. \`${a}\``).join("\n")
          : t("You have no verified wallets on this server.")) +
        (pending ? "\n\n" + pending.content : ""),
      components,
    });
  } else if (/^holder:remove:0x[0-9a-fA-F]{40}$/.test(id)) {
    const address = id.slice("holder:remove:".length);
    // The repository validates guild + clicking user's ownership again on confirmation.
    await interaction.editReply({
      ...common,
      content: t(
        "Remove `{0}`? This may remove your holder roles. Proof history is retained; this is not data erasure.",
        address,
      ),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(
            `holder:confirm:${address}`,
            t("Confirm removal"),
            ButtonStyle.Danger,
          ),
          button("holder:wallets", t("Cancel")),
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
        ? t("Wallet removed. ") +
          (await refreshAfterChange(roles, guildId, userId))
        : t(
            "No verified wallet was removed. Any matching pending challenge was cancelled.",
          ),
      components: [memberActions()],
    });
  } else if (id === "holder:refresh") {
    const result = await roles.refresh(guildId, userId);
    await interaction.editReply({
      ...common,
      content: result.desired.length
        ? t("Roles refreshed: ") +
          result.desired.map((r) => `<@&${r}>`).join(", ")
        : t(
            "Roles refreshed. You do not currently qualify for a configured role.",
          ),
      components: [memberActions()],
    });
  } else if (id === "holder:status") {
    const result = await roles.inspect(guildId, userId);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t("Your holder eligibility"))
      .setDescription(
        t(
          "Quantities are summed across your verified wallets. This view does not change roles. Use Refresh roles to claim them. Status and refresh share a one-minute cooldown.",
        ),
      )
      .setFooter({
        text: t(
          "NFT balances are indexed. ERC-20 balances use an on-chain block snapshot.",
        ),
      });
    if (!result.rules.length)
      embed.setDescription(
        t("No holder role rules have been configured on this server yet."),
      );
    let budget = 5000;
    let shown = 0;
    for (const rule of result.rules) {
      const field = {
        name:
          rule.assetType === "ERC20"
            ? `${rule.group} · ERC-20`
            : `${rule.group} · ${rule.minimum} NFT`,
        value:
          t(
            "<@&{0}> · {1}{2} held · {3}",
            rule.roleId,
            ruleQuantity(rule, result.counts.get(rule.id) ?? 0n),
            rule.assetType === "ERC20" ? " tokens" : "",
            result.desired.includes(rule.roleId)
              ? t("Eligible")
              : t("Not selected"),
          ) +
          (rule.assetType === "ERC20"
            ? t(
                "\nMinimum: {0} tokens · {1} decimals",
                ruleQuantity(rule, rule.minimum),
                rule.decimals,
              )
            : ""),
      };
      const size = field.name.length + field.value.length;
      if (size > budget) break;
      embed.addFields(field);
      budget -= size;
      shown++;
    }
    const truncated = shown < result.rules.length;
    if (truncated)
      embed.addFields({
        name: t("More rules"),
        value: t(
          "{0} additional rules. Open status.json for all exact quantities and thresholds.",
          result.rules.length - shown,
        ),
      });
    await interaction.editReply({
      ...common,
      embeds: [embed],
      components: [memberActions()],
      ...(truncated
        ? {
            files: [
              new AttachmentBuilder(
                Buffer.from(
                  JSON.stringify(
                    result.rules.map((rule) => ({
                      ...rule,
                      minimumTokens: ruleQuantity(rule, rule.minimum),
                      held: ruleQuantity(
                        rule,
                        result.counts.get(rule.id) ?? 0n,
                      ),
                      eligible: result.desired.includes(rule.roleId),
                    })),
                    null,
                    2,
                  ),
                ),
                { name: "status.json" },
              ),
            ],
          }
        : {}),
    });
  } else throw new WalletError("notFound");
}
