import { InteractionContextType, SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Learn how Holder Bot works and see available features.")
    .setContexts(InteractionContextType.Guild)
    .toJSON(),
];
