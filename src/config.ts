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
  ETHEREUM_RPC_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().startsWith("https://").optional(),
  ),
  POLYGON_RPC_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().startsWith("https://").optional(),
  ),
  ALCHEMY_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,200}$/)
      .optional(),
  ),
  SCHEDULER_ENABLED: z.preprocess(
    (value) => (value === undefined || value === "" ? undefined : value),
    z.enum(["true", "false"]).optional(),
  ),
  ALCHEMY_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .refine(
        (value) =>
          /^[A-Za-z0-9+/]{43}=$/.test(value) &&
          Buffer.from(value, "base64").length === 32 &&
          Buffer.from(value, "base64").toString("base64") === value,
      )
      .optional(),
  ),
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
