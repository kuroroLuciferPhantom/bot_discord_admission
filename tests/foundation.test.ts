import { describe, expect, it, vi } from "vitest";
import {
  MessageFlags,
  InteractionContextType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { readConfig, readDeploymentScope } from "../src/config.js";
import { commands } from "../src/discord/commands.js";
import { handleCommand } from "../src/discord/handler.js";
import { createSettingsStore } from "../src/storage.js";

const env = {
  DISCORD_TOKEN: "test-token",
  DISCORD_APPLICATION_ID: "123456789012345678",
  DATABASE_URL: "postgresql://user:secret@localhost:5432/test",
};

function interaction(
  guildId: string | null = "111111111111111111",
  name = "help",
) {
  const value = {
    guildId,
    commandName: name,
    deferred: false,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn(async () => {
      value.deferred = true;
    }),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
  return value;
}

describe("configuration", () => {
  it("accepts valid configuration", () => expect(readConfig(env)).toEqual(env));
  it.each(["DISCORD_TOKEN", "DISCORD_APPLICATION_ID", "DATABASE_URL"])(
    "requires %s without leaking values",
    (key) => {
      expect(() => readConfig({ ...env, [key]: "" })).toThrow(key);
      try {
        readConfig({ ...env, DATABASE_URL: "secret-value" });
      } catch (error) {
        expect(String(error)).not.toContain("secret-value");
      }
    },
  );
  it("rejects non-Postgres URLs", () =>
    expect(() =>
      readConfig({ ...env, DATABASE_URL: "https://example.com" }),
    ).toThrow());
  it("requires explicit command scope", () =>
    expect(() => readDeploymentScope(env, undefined)).toThrow());
  it("requires a test guild for guild deployment", () =>
    expect(() => readDeploymentScope(env, "--guild")).toThrow());
  it("accepts global deployment explicitly", () =>
    expect(readDeploymentScope(env, "--global")).toEqual({ kind: "global" }));
  it("accepts guild deployment explicitly", () =>
    expect(
      readDeploymentScope(
        { ...env, DISCORD_TEST_GUILD_ID: "111111111111111111" },
        "--guild",
      ),
    ).toEqual({ kind: "guild", guildId: "111111111111111111" }));
});

describe("Discord foundation", () => {
  it("registers only implemented guild commands", () => {
    expect(commands.map((command) => command.name)).toEqual(["help", "wallet"]);
    expect(commands[0]?.contexts).toEqual([InteractionContextType.Guild]);
  });
  it("defers privately before persistence", async () => {
    const event = interaction();
    const store = {
      ensureGuild: vi.fn(async () => {
        expect(event.deferred).toBe(true);
      }),
    };
    await handleCommand(
      event as unknown as ChatInputCommandInteraction,
      store,
      vi.fn(),
    );
    expect(event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(store.ensureGuild).toHaveBeenCalledWith(event.guildId);
    expect(event.editReply).toHaveBeenCalledWith(
      expect.stringContaining("not available yet"),
    );
  });
  it("rejects DMs without touching storage", async () => {
    const event = interaction(null);
    const store = { ensureGuild: vi.fn() };
    await handleCommand(
      event as unknown as ChatInputCommandInteraction,
      store,
      vi.fn(),
    );
    expect(store.ensureGuild).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });
  it("does not execute unimplemented commands", async () => {
    const event = interaction(undefined, "wallet");
    const store = { ensureGuild: vi.fn() };
    await handleCommand(
      event as unknown as ChatInputCommandInteraction,
      store,
      vi.fn(),
    );
    expect(store.ensureGuild).not.toHaveBeenCalled();
  });
  it("hides database failures", async () => {
    const event = interaction();
    const report = vi.fn();
    await handleCommand(
      event as unknown as ChatInputCommandInteraction,
      { ensureGuild: vi.fn().mockRejectedValue(new Error("secret")) },
      report,
    );
    expect(report).toHaveBeenCalledWith();
    expect(event.editReply).toHaveBeenCalledWith(
      "Something went wrong. Please try again later.",
    );
  });
  it("handles expired interactions without rejection", async () => {
    const event = interaction();
    event.editReply.mockRejectedValue(new Error("expired"));
    await expect(
      handleCommand(
        event as unknown as ChatInputCommandInteraction,
        { ensureGuild: vi.fn() },
        vi.fn(),
      ),
    ).resolves.toBeUndefined();
  });
  it("scopes every settings insert to the supplied guild", async () => {
    const createMany = vi.fn();
    const db = { guildSettings: { createMany } };
    const store = createSettingsStore(
      db as unknown as Parameters<typeof createSettingsStore>[0],
    );
    await store.ensureGuild("111111111111111111");
    await store.ensureGuild("222222222222222222");
    expect(createMany.mock.calls.map(([arg]) => arg.data[0].guildId)).toEqual([
      "111111111111111111",
      "222222222222222222",
    ]);
    expect(createMany.mock.calls[0]?.[0].skipDuplicates).toBe(true);
  });
});
