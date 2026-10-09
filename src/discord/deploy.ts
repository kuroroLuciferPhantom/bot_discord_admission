import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readConfig, readDeploymentScope } from "../config.js";
import { commands } from "./commands.js";

try {
  const config = readConfig(process.env);
  const scope = readDeploymentScope(process.env, process.argv[2]);
  const route =
    scope.kind === "guild"
      ? Routes.applicationGuildCommands(
          config.DISCORD_APPLICATION_ID,
          scope.guildId,
        )
      : Routes.applicationCommands(config.DISCORD_APPLICATION_ID);
  await new REST({ version: "10" })
    .setToken(config.DISCORD_TOKEN)
    .put(route, { body: commands });
  console.info(
    `Registered ${commands.length} command(s), scope: ${scope.kind}.`,
  );
} catch {
  console.error(
    "Command registration failed. Check configuration and Discord permissions.",
  );
  process.exitCode = 1;
}
