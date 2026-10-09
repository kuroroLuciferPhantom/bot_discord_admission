import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { readConfig } from "./config.js";
import { createDatabase, createSettingsStore } from "./storage.js";
import { handleCommand } from "./discord/handler.js";

async function main() {
  const config = readConfig(process.env);
  const db = createDatabase(config.DATABASE_URL);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const store = createSettingsStore(db);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    try {
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
  client.once(Events.ClientReady, () => console.info("Holder Bot connected."));
  client.on(Events.Error, () => console.error("Discord client error."));
  client.on(Events.InteractionCreate, (interaction) => {
    if (closing || !interaction.isChatInputCommand()) return;
    void handleCommand(interaction, store, () =>
      console.error("Command handling failed."),
    );
  });
  try {
    await db.$queryRaw`SELECT 1 FROM "GuildSettings" LIMIT 1`;
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
