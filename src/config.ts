import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/);
const databaseUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  });
const schema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1),
  DISCORD_APPLICATION_ID: snowflake,
  DATABASE_URL: databaseUrl,
});

export function readConfig(env: NodeJS.ProcessEnv) {
  const result = schema.safeParse(env);
  if (!result.success) {
    // Do not include supplied values, URLs or tokens in error output.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Invalid configuration: ${fields.join(", ")}`);
  }
  return result.data;
}

export function readDeploymentScope(
  env: NodeJS.ProcessEnv,
  mode: string | undefined,
) {
  if (mode === "--global") return { kind: "global" as const };
  if (mode !== "--guild")
    throw new Error("Choose --guild or --global explicitly.");
  if (!snowflake.safeParse(env.DISCORD_TEST_GUILD_ID).success) {
    throw new Error("Invalid configuration: DISCORD_TEST_GUILD_ID");
  }
  return { kind: "guild" as const, guildId: env.DISCORD_TEST_GUILD_ID! };
}
