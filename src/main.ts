import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { readConfig } from "./config.js";
import { createDatabase, createSettingsStore } from "./storage.js";
import { handleCommand } from "./discord/handler.js";
import {
  MessageFlags,
  type ModalSubmitInteraction,
  type ButtonInteraction,
} from "discord.js";
import { createChainReader } from "./wallets/chain.js";
import { createWalletRepository } from "./wallets/repository.js";
import { WalletService } from "./wallets/service.js";
import { WalletError } from "./wallets/domain.js";
import { RoleError } from "./roles/domain.js";
import { roleErrorMessage } from "./discord/roles.js";
import { RoleService } from "./roles/service.js";
import { createRoleRepository } from "./roles/repository.js";
import { createRoleGateway } from "./roles/discord.js";
import { createHoldingsReader } from "./roles/alchemy.js";
import { createJobRepository } from "./jobs/repository.js";
import { CheckWorker } from "./jobs/worker.js";
import { panelButton, memberActions } from "./discord/panel.js";
import { createVault, AlchemyError } from "./alchemy/vault.js";
import { guildProviders } from "./alchemy/providers.js";
import {
  AlchemySettings,
  alchemyModal,
  alchemyErrorMessage,
} from "./discord/alchemy.js";
import {
  walletModal,
  walletButton,
  walletErrorMessage,
} from "./discord/wallets.js";

async function main() {
  const config = readConfig(process.env);
  const db = createDatabase(config.DATABASE_URL);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const store = createSettingsStore(db);
  const providers = guildProviders(
    createVault(db, config.ALCHEMY_ENCRYPTION_KEY),
    createHoldingsReader(
      config.ALCHEMY_API_KEY
        ? {
            1: `https://eth-mainnet.g.alchemy.com/nft/v3/${config.ALCHEMY_API_KEY}`,
            137: `https://polygon-mainnet.g.alchemy.com/nft/v3/${config.ALCHEMY_API_KEY}`,
          }
        : {},
    ),
    createChainReader({
      ...(config.ETHEREUM_RPC_URL ? { 1: config.ETHEREUM_RPC_URL } : {}),
      ...(config.POLYGON_RPC_URL ? { 137: config.POLYGON_RPC_URL } : {}),
    }),
  );
  const roles = new RoleService(
    createRoleRepository(db),
    createRoleGateway(client),
    providers.holdings,
  );
  const alchemy = new AlchemySettings(
    createVault(db, config.ALCHEMY_ENCRYPTION_KEY),
    roles.gate,
  );
  const wallets = new WalletService(
    createWalletRepository(db),
    providers.chain,
    () => new Date(),
    (guildId, task) => roles.gate.run(guildId, task),
  );
  const worker = new CheckWorker(createJobRepository(db), roles, (event) =>
    console.info(event),
  );
  roles.schedulerEnabled = config.SCHEDULER_ENABLED === "true";
  const handleWalletInteraction = async (
    interaction: ModalSubmitInteraction | ButtonInteraction,
  ) => {
    try {
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("alchemy:")
      )
        await alchemyModal(interaction, alchemy);
      else if (interaction.isModalSubmit())
        await walletModal(interaction, wallets, roles);
      else if (interaction.customId.startsWith("holder:"))
        await panelButton(interaction, wallets, roles);
      else await walletButton(interaction, wallets);
    } catch (error) {
      if (
        !(error instanceof WalletError) &&
        !(error instanceof RoleError) &&
        !(error instanceof AlchemyError)
      )
        console.error("Wallet interaction failed.");
      try {
        if (interaction.deferred || interaction.replied)
          await interaction.editReply({
            content:
              error instanceof AlchemyError
                ? alchemyErrorMessage(error)
                : error instanceof RoleError
                  ? roleErrorMessage(error)
                  : walletErrorMessage(error),
            ...(interaction.customId.startsWith("holder:")
              ? { components: [memberActions()] }
              : {}),
            allowedMentions: { parse: [] },
          });
        else
          await interaction.reply({
            content:
              error instanceof AlchemyError
                ? alchemyErrorMessage(error)
                : error instanceof RoleError
                  ? roleErrorMessage(error)
                  : walletErrorMessage(error),
            flags: MessageFlags.Ephemeral,
          });
      } catch {
        console.error("Wallet response failed.");
      }
    }
  };
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    try {
      await worker.stop();
      await client.destroy();
      await db.$disconnect();
    } catch {
      console.error("Shutdown failed.");
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
  client.once(Events.ClientReady, () => {
    console.info("Holder Bot connected.");
    if (!closing && config.SCHEDULER_ENABLED === "true") worker.start();
    else console.info("Scheduled checker disabled.");
  });
  client.on(Events.Error, () => console.error("Discord client error."));
  client.on(Events.InteractionCreate, (interaction) => {
    if (closing) return;
    if (interaction.isChatInputCommand())
      void handleCommand(
        interaction,
        store,
        () => console.error("Command handling failed."),
        wallets,
        roles,
        alchemy,
      );
    else if (
      (interaction.isModalSubmit() || interaction.isButton()) &&
      (interaction.customId.startsWith("wallet:") ||
        interaction.customId.startsWith("alchemy:") ||
        (interaction.isButton() && interaction.customId.startsWith("holder:")))
    )
      void handleWalletInteraction(interaction);
  });
  try {
    await db.$queryRaw`SELECT 1 FROM "GuildSettings" LIMIT 1`;
    await db.$queryRaw`SELECT 1 FROM "RoleRule" LIMIT 1`;
    await db.$queryRaw`SELECT "nextCheckAt" FROM "RoleMember" LIMIT 1`;
    await db.$queryRaw`SELECT 1 FROM "GuildAlchemyConfig" LIMIT 1`;
    if (!closing) await client.login(config.DISCORD_TOKEN);
  } catch {
    await shutdown();
    throw new Error(
      "Startup failed. Check configuration, database migrations and Discord access.",
    );
  }
}

main().catch(() => {
  console.error(
    "Bot startup failed. Check configuration, database migrations and Discord access.",
  );
  process.exitCode = 1;
});
