import { describe, expect, it, vi } from "vitest";
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  createCipher,
  apiKey,
  AlchemyError,
  type AlchemyVault,
} from "../src/alchemy/vault.js";
import {
  endpoints,
  guildProviders,
  validateKey,
} from "../src/alchemy/providers.js";
import {
  AlchemySettings,
  alchemyCommand,
  alchemyModal,
  alchemyErrorMessage,
} from "../src/discord/alchemy.js";
import { GuildGate } from "../src/roles/gate.js";
import { readConfig } from "../src/config.js";
const master = Buffer.alloc(32, 42).toString("base64"),
  key = "synthetic-test-key";
function fixture(sub = "alchemy") {
  const vault = {
    enabled: true as boolean,
    get: vi.fn(),
    configured: vi.fn().mockResolvedValue(true),
    save: vi.fn(),
    remove: vi.fn(),
  } satisfies AlchemyVault;
  const validate = vi.fn();
  const settings = new AlchemySettings(vault, new GuildGate(), validate);
  const event = {
    guildId: "guild",
    memberPermissions: { has: () => true },
    options: { getSubcommand: () => sub, getBoolean: () => true },
    customId: "alchemy:save",
    fields: { getTextInputValue: () => key },
    showModal: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  };
  return { vault, validate, settings, event };
}
describe("authenticated credential encryption", () => {
  it("randomizes encryption and binds ciphertext to the guild", () => {
    const cipher = createCipher(master),
      one = cipher.seal("a", key),
      two = cipher.seal("a", key);
    expect(one).not.toBe(two);
    expect(one).not.toContain(key);
    expect(cipher.open("a", one)).toBe(key);
    expect(() => cipher.open("b", one)).toThrow("locked");
    expect(() =>
      createCipher(Buffer.alloc(32, 43).toString("base64")).open("a", one),
    ).toThrow("locked");
    expect(() => cipher.open("a", one.slice(0, -5) + "AAAAA")).toThrow(
      "locked",
    );
  });
  it.each(["v2.x.y.z", "v1", "v1.x.y.z.extra", "a".repeat(600)])(
    "rejects damaged envelope %s",
    (envelope) =>
      expect(() => createCipher(master).open("a", envelope)).toThrow("locked"),
  );
  it("rejects URLs/whitespace/invalid secrets without echoing them", () => {
    expect(apiKey("  " + key + "  ")).toBe(key);
    expect(() => apiKey("https://provider/secret")).toThrow("invalid");
    expect(() => createCipher("short")).toThrow("disabled");
    const env = {
      DISCORD_TOKEN: "token",
      DISCORD_APPLICATION_ID: "123456789012345678",
      DATABASE_URL: "postgresql://localhost/test",
    };
    expect(
      readConfig({ ...env, ALCHEMY_ENCRYPTION_KEY: master })
        .ALCHEMY_ENCRYPTION_KEY,
    ).toBe(master);
    expect(() =>
      readConfig({ ...env, ALCHEMY_ENCRYPTION_KEY: "private-invalid-value" }),
    ).toThrow("ALCHEMY_ENCRYPTION_KEY");
    try {
      readConfig({ ...env, ALCHEMY_ENCRYPTION_KEY: "private-invalid-value" });
    } catch (error) {
      expect(String(error)).not.toContain("private-invalid-value");
    }
  });
});
describe("key validation and provider selection", () => {
  const validFetch = vi.fn(
    async (url: unknown) =>
      new Response(
        JSON.stringify(
          String(url).includes("/nft/")
            ? { ownedNfts: [] }
            : { result: String(url).includes("eth-mainnet") ? "0x1" : "0x89" },
        ),
      ),
  );
  it("validates RPC and NFT access on both networks using fixed destinations", async () => {
    validFetch.mockClear();
    await validateKey(key, validFetch);
    expect(validFetch).toHaveBeenCalledTimes(4);
    expect(endpoints(key).rpc[137]).toContain("polygon-mainnet.g.alchemy.com");
    const calls = validFetch.mock.calls as unknown as [unknown, RequestInit][];
    for (const [url, init] of calls) {
      expect(String(url)).toMatch(
        /^https:\/\/(eth|polygon)-mainnet\.g\.alchemy\.com\//,
      );
      expect(init.redirect).toBe("error");
    }
  });
  it.each(["http", "rpc-error", "wrong-chain", "malformed", "nft-denied"])(
    "rejects validation failure %s with sanitized message",
    async (mode) => {
      const fetcher = vi.fn(async (url: unknown) => {
        if (
          mode === "http" ||
          (mode === "nft-denied" && String(url).includes("/nft/"))
        )
          return new Response("secret", { status: 403 });
        if (mode === "malformed") return new Response("not JSON secret");
        if (mode === "rpc-error")
          return new Response(JSON.stringify({ error: "secret" }));
        if (mode === "wrong-chain")
          return new Response(JSON.stringify({ result: "0x2" }));
        return new Response(
          JSON.stringify({
            result: String(url).includes("eth-mainnet") ? "0x1" : "0x89",
          }),
        );
      });
      await expect(validateKey(key, fetcher)).rejects.toThrow("unavailable");
    },
  );
  it("uses fallback only when no guild key exists, never for locked keys", async () => {
    const f = fixture(),
      fallbackHoldings = { read: vi.fn() },
      fallbackChain = { snapshot: vi.fn(), proof: vi.fn() };
    const providers = guildProviders(f.vault, fallbackHoldings, fallbackChain);
    f.vault.get.mockResolvedValue(undefined);
    expect(await providers.holdings("a")).toBe(fallbackHoldings);
    expect(await providers.chain("a")).toBe(fallbackChain);
    f.vault.get.mockResolvedValue(key);
    expect(await providers.holdings("b")).not.toBe(fallbackHoldings);
    expect(await providers.chain("b")).not.toBe(fallbackChain);
    expect(f.vault.get).toHaveBeenCalledWith("b");
    f.vault.get.mockRejectedValue(new AlchemyError("locked"));
    await expect(providers.holdings("b")).rejects.toThrow("provider");
    await expect(providers.chain("b")).rejects.toThrow("unavailable");
  });
});
describe("private admin Alchemy settings", () => {
  it("checks admin permissions before both modal opening and submission", async () => {
    const f = fixture();
    f.event.memberPermissions.has = () => false;
    await expect(
      alchemyCommand(
        f.event as unknown as ChatInputCommandInteraction,
        f.settings,
      ),
    ).rejects.toThrow("adminOnly");
    await expect(
      alchemyModal(f.event as unknown as ModalSubmitInteraction, f.settings),
    ).rejects.toThrow("adminOnly");
    expect(f.validate).not.toHaveBeenCalled();
    expect(f.vault.save).not.toHaveBeenCalled();
  });
  it("opens a blank private form with no key in custom IDs or defaults", async () => {
    const f = fixture();
    await alchemyCommand(
      f.event as unknown as ChatInputCommandInteraction,
      f.settings,
    );
    const modal = f.event.showModal.mock.calls[0]![0].toJSON();
    expect(modal.custom_id).toBe("alchemy:save");
    expect(JSON.stringify(modal)).not.toContain(key);
    expect(f.vault.get).not.toHaveBeenCalled();
  });
  it("validates before saving and never echoes submitted keys", async () => {
    const f = fixture();
    await alchemyModal(
      f.event as unknown as ModalSubmitInteraction,
      f.settings,
    );
    expect(f.event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(f.validate).toHaveBeenCalledWith(key);
    expect(f.vault.save).toHaveBeenCalledWith("guild", key);
    expect(f.validate.mock.invocationCallOrder[0]!).toBeLessThan(
      f.vault.save.mock.invocationCallOrder[0]!,
    );
    expect(JSON.stringify(f.event.editReply.mock.calls)).not.toContain(key);
    await expect(f.settings.save("guild", key)).rejects.toThrow("busy");
  });
  it("does not replace prior keys on failure", async () => {
    const f = fixture();
    f.validate.mockRejectedValue(new AlchemyError("unavailable"));
    await expect(f.settings.save("guild", key)).rejects.toThrow("unavailable");
    expect(f.vault.save).not.toHaveBeenCalled();
  });
  it("status never decrypts or returns stored secrets", async () => {
    const f = fixture("alchemy-status");
    await alchemyCommand(
      f.event as unknown as ChatInputCommandInteraction,
      f.settings,
    );
    expect(f.vault.configured).toHaveBeenCalledWith("guild");
    expect(f.vault.get).not.toHaveBeenCalled();
    expect(f.event.editReply).toHaveBeenCalledWith(
      expect.stringContaining("configured"),
    );
  });
  it("requires confirmation before removing a guild override", async () => {
    const f = fixture("alchemy-remove");
    f.event.options.getBoolean = () => false;
    await expect(
      alchemyCommand(
        f.event as unknown as ChatInputCommandInteraction,
        f.settings,
      ),
    ).rejects.toThrow("invalid");
    expect(f.vault.remove).not.toHaveBeenCalled();
    f.event.options.getBoolean = () => true;
    await alchemyCommand(
      f.event as unknown as ChatInputCommandInteraction,
      f.settings,
    );
    expect(f.vault.remove).toHaveBeenCalledWith("guild");
  });
  it("disables writes when the host encryption secret is absent", async () => {
    const f = fixture();
    f.vault.enabled = false;
    await expect(f.settings.save("guild", key)).rejects.toThrow("disabled");
    expect(f.validate).not.toHaveBeenCalled();
    expect(alchemyErrorMessage(new AlchemyError("disabled"))).not.toContain(
      key,
    );
  });
  it("shares the guild mutation gate with refresh/config operations", async () => {
    const f = fixture(),
      gate = new GuildGate(),
      settings = new AlchemySettings(f.vault, gate, f.validate);
    await gate.run("guild", async () => {
      await expect(settings.save("guild", key)).rejects.toThrow("busy");
    });
    expect(f.validate).not.toHaveBeenCalled();
  });
});
