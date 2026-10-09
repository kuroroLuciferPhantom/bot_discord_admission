import {
  InteractionContextType,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { SlashCommandSubcommandBuilder } from "discord.js";

function ruleOptions(command: SlashCommandSubcommandBuilder) {
  return command
    .addStringOption((o) =>
      o
        .setName("group")
        .setDescription("Tier group, lowercase letters/digits/_/-.")
        .setRequired(true)
        .setMaxLength(32),
    )
    .addStringOption((o) =>
      o
        .setName("network")
        .setDescription("Collection network.")
        .setRequired(true)
        .addChoices(
          { name: "Ethereum", value: "ethereum" },
          { name: "Polygon", value: "polygon" },
        ),
    )
    .addStringOption((o) =>
      o
        .setName("contract")
        .setDescription("NFT collection contract address.")
        .setRequired(true)
        .setMinLength(42)
        .setMaxLength(42),
    )
    .addStringOption((o) =>
      o
        .setName("minimum")
        .setDescription("Minimum number of NFT copies (positive integer).")
        .setRequired(true)
        .setMaxLength(78),
    )
    .addRoleOption((o) =>
      o
        .setName("role")
        .setDescription(
          "Role to manage (below the bot, no administrative powers).",
        )
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("token-ids")
        .setDescription(
          "Optional comma-separated token IDs; omit for the whole collection.",
        )
        .setMaxLength(4000),
    );
}

export const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription(
      "Publish the permanent member button panel in this channel.",
    )
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((c) =>
      c.setName("publish").setDescription("Publish the member panel."),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Administer NFT role thresholds.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((c) =>
      ruleOptions(
        c.setName("add").setDescription("Add an NFT role threshold."),
      ),
    )
    .addSubcommand((c) =>
      ruleOptions(
        c
          .setName("edit")
          .setDescription("Replace an existing rule.")
          .addStringOption((o) =>
            o
              .setName("id")
              .setDescription("Rule ID.")
              .setRequired(true)
              .setMaxLength(36),
          ),
      ),
    )
    .addSubcommand((c) =>
      c
        .setName("list")
        .setDescription("Privately list rules.")
        .addIntegerOption((o) =>
          o
            .setName("page")
            .setDescription("Page number.")
            .setMinValue(1)
            .setMaxValue(4),
        ),
    )
    .addSubcommand((c) =>
      c
        .setName("remove")
        .setDescription(
          "Remove a rule; its managed role is cleaned on the next member refresh.",
        )
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("Rule ID.")
            .setRequired(true)
            .setMaxLength(36),
        ),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Administer bot settings.")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((c) =>
      c
        .setName("status")
        .setDescription("Show scheduler status and tracked member counts."),
    )
    .addSubcommand((c) =>
      c
        .setName("role-stacking")
        .setDescription(
          "Keep all eligible tiers or only the highest tier per group.",
        )
        .addBooleanOption((o) =>
          o
            .setName("enabled")
            .setDescription("Whether role stacking is enabled.")
            .setRequired(true),
        ),
    )
    .addSubcommand((c) =>
      c
        .setName("check-frequency")
        .setDescription(
          "Set the scheduled check frequency for active role holders.",
        )
        .addIntegerOption((o) =>
          o
            .setName("times-per-week")
            .setDescription("Weekly check frequency.")
            .setRequired(true)
            .addChoices(
              { name: "Once", value: 1 },
              { name: "Twice", value: 2 },
            ),
        ),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Check your NFT holdings and refresh your roles.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((c) =>
      c
        .setName("refresh")
        .setDescription("Refresh your NFT roles (one request per minute)."),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn how Holder Bot works and see available features.")
    .setContexts(InteractionContextType.Guild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Manage your verified wallets.")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((command) =>
      command
        .setName("add")
        .setDescription("Verify a wallet using a private form.")
        .addStringOption((option) =>
          option
            .setName("network")
            .setDescription("Network for the native self-transfer.")
            .setRequired(true)
            .addChoices(
              { name: "Ethereum (ETH)", value: "ethereum" },
              { name: "Polygon (POL)", value: "polygon" },
            ),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("list")
        .setDescription("Privately list your wallets and pending challenge."),
    )
    .addSubcommand((command) =>
      command
        .setName("remove")
        .setDescription(
          "Remove one of your verified wallets or cancel its challenge.",
        )
        .addStringOption((option) =>
          option
            .setName("address")
            .setDescription("Your EVM address.")
            .setRequired(true)
            .setMinLength(42)
            .setMaxLength(42),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("verify")
        .setDescription("Submit your self-transfer transaction hash.")
        .addStringOption((option) =>
          option
            .setName("challenge")
            .setDescription("Challenge ID from /wallet add or /wallet list.")
            .setRequired(true)
            .setMaxLength(36),
        )
        .addStringOption((option) =>
          option
            .setName("transaction")
            .setDescription("The transaction hash, not an explorer URL.")
            .setRequired(true)
            .setMinLength(66)
            .setMaxLength(66),
        ),
    )
    .toJSON(),
];
