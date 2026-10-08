import { InteractionContextType, SlashCommandBuilder } from "discord.js";

export const commands = [
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
