import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
} from "discord.js";
import { supportedLanguage, t, withLanguage } from "../src/discord/i18n.js";
import { french } from "../src/discord/translations/fr.js";
import {
  createLanguageStore,
  LanguageSettings,
  languageCommand,
} from "../src/discord/language.js";
import { commands } from "../src/discord/commands.js";
import { handleCommand } from "../src/discord/handler.js";
import { panelReply, panelButton } from "../src/discord/panel.js";
import {
  addModal,
  challengeReply,
  walletButton,
  walletErrorMessage,
} from "../src/discord/wallets.js";
import {
  alchemyCommand,
  alchemyErrorMessage,
  type AlchemySettings,
} from "../src/discord/alchemy.js";
import { roleCommand, roleErrorMessage } from "../src/discord/roles.js";
import { WalletError, type Challenge } from "../src/wallets/domain.js";
import { RoleError, type Rule } from "../src/roles/domain.js";
import { AlchemyError } from "../src/alchemy/vault.js";
import type { WalletService } from "../src/wallets/service.js";
import type { RoleService } from "../src/roles/service.js";

const address = "0x1111111111111111111111111111111111111111";
function settings() {
  const store = {
    load: vi.fn().mockResolvedValue([{ guildId: "guild", language: "fr" }]),
    save: vi.fn(),
  };
  return { store, languages: new LanguageSettings(store) };
}
function command(name = "help", locale = "fr", sub = "language") {
  const event = {
    commandName: name,
    locale,
    guildId: "guild",
    user: { id: "user" },
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    options: {
      getSubcommand: () => sub,
      getString: vi.fn().mockReturnValue("fr"),
      getInteger: vi.fn().mockReturnValue(1),
    },
    deferred: false,
    replied: false,
    deferReply: vi.fn(async () => {
      event.deferred = true;
    }),
    reply: vi.fn(),
    editReply: vi.fn(),
    showModal: vi.fn(),
  };
  return event;
}
const asCommand = (event: ReturnType<typeof command>) =>
  event as unknown as ChatInputCommandInteraction;

describe("translation catalogs", () => {
  it("keeps placeholders, fallback text and external values exact", () => {
    for (const [key, value] of Object.entries(french)) {
      const placeholders = (text: string) =>
        [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
      expect(placeholders(value), key).toEqual(placeholders(key));
      expect(withLanguage("en", () => t(key as keyof typeof french))).toBe(key);
      expect(withLanguage("fr", () => t(key as keyof typeof french))).toBe(
        value,
      );
    }
    expect(
      withLanguage("fr", () => t("Challenge: `{0}`", "proof-{0}-{1}")),
    ).toBe("Défi : `proof-{0}-{1}`");
    expect(t("My wallets")).toBe("My wallets");
  });
  it("supplies every template argument at its call site", () => {
    for (const file of [
      "panel",
      "wallets",
      "roles",
      "alchemy",
      "messages",
      "language",
    ]) {
      const tree = ts.createSourceFile(
        file,
        readFileSync(`src/discord/${file}.ts`, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "t"
        ) {
          const key = node.arguments[0];
          expect(key && ts.isStringLiteral(key), file).toBe(true);
          if (key && ts.isStringLiteral(key)) {
            expect(french).toHaveProperty(key.text);
            const indexes = [...key.text.matchAll(/\{(\d+)\}/g)].map((m) =>
              Number(m[1]),
            );
            expect(node.arguments.length - 1, key.text).toBe(
              indexes.length ? Math.max(...indexes) + 1 : 0,
            );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  });
  it("isolates simultaneous asynchronous locales and restores outer contexts", async () => {
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const fr = withLanguage("fr", async () => {
      await gate;
      return t("My wallets");
    });
    const en = withLanguage("en", async () => {
      unblock();
      await Promise.resolve();
      return t("My wallets");
    });
    expect(await Promise.all([fr, en])).toEqual(["Mes wallets", "My wallets"]);
    withLanguage("fr", () => {
      expect(withLanguage("en", () => t("My status"))).toBe("My status");
      expect(t("My status")).toBe("Mon statut");
    });
    expect(t("My status")).toBe("My status");
  });
});

describe("server language settings", () => {
  it("prefers supported Discord locales, then persisted guild language, then English", async () => {
    const { languages, store } = settings();
    await languages.load();
    expect(languages.forInteraction({ locale: "fr", guildId: "other" })).toBe(
      "fr",
    );
    expect(
      languages.forInteraction({ locale: "en-US", guildId: "guild" }),
    ).toBe("en");
    expect(
      languages.forInteraction({ locale: "en-GB", guildId: "guild" }),
    ).toBe("en");
    expect(languages.forInteraction({ locale: "ja", guildId: "guild" })).toBe(
      "fr",
    );
    expect(languages.forInteraction({ locale: "ja", guildId: "other" })).toBe(
      "en",
    );
    expect(languages.forInteraction({ locale: "ja", guildId: null })).toBe(
      "en",
    );
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(supportedLanguage("de")).toBeUndefined();
    await languages.save("guild", "en");
    expect(languages.guildLanguage("guild")).toBe("en");
    expect(store.save).toHaveBeenCalledWith("guild", "en");
  });
  it("does not update the cache when persistence fails or accept an invalid language", async () => {
    const { languages, store } = settings();
    await languages.load();
    store.save.mockRejectedValue(new Error("db secret"));
    await expect(languages.save("guild", "en")).rejects.toThrow();
    expect(languages.guildLanguage("guild")).toBe("fr");
    store.save.mockClear();
    await expect(languages.save("guild", "de" as "fr")).rejects.toThrow(
      "invalidRule",
    );
    expect(store.save).not.toHaveBeenCalled();
  });
  it("rejects overlapping writes and retains the durable language", async () => {
    const { languages, store } = settings();
    let unblock!: () => void;
    store.save.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        }),
    );
    const pending = languages.save("guild", "fr");
    await expect(languages.save("guild", "en")).rejects.toThrow("busy");
    expect(languages.guildLanguage("guild")).toBe("en");
    unblock();
    await pending;
    expect(languages.guildLanguage("guild")).toBe("fr");
  });
  it("scopes language upserts to the guild without overwriting role settings", async () => {
    const upsert = vi.fn(),
      findMany = vi.fn().mockResolvedValue([]);
    const store = createLanguageStore({
      guildSettings: { upsert, findMany },
    } as unknown as Parameters<typeof createLanguageStore>[0]);
    await store.save("first", "fr");
    await store.save("second", "en");
    await store.load();
    expect(upsert.mock.calls.map(([data]) => data)).toEqual([
      {
        where: { guildId: "first" },
        create: { guildId: "first", language: "fr" },
        update: { language: "fr" },
      },
      {
        where: { guildId: "second" },
        create: { guildId: "second", language: "en" },
        update: { language: "en" },
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { language: "fr" },
      select: { guildId: true, language: true },
    });
  });
  it("requires admin permission, defers privately, and persists only supported choices", async () => {
    const { languages, store } = settings();
    const event = command("settings");
    event.memberPermissions.has.mockReturnValue(false);
    await expect(languageCommand(asCommand(event), languages)).rejects.toThrow(
      "adminOnly",
    );
    expect(event.deferReply).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    event.memberPermissions.has.mockReturnValue(true);
    store.save.mockImplementation(async () => {
      expect(event.deferred).toBe(true);
    });
    await withLanguage("fr", () =>
      languageCommand(asCommand(event), languages),
    );
    expect(event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(event.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Langue du serveur enregistrée : français"),
    );
    event.options.getString.mockReturnValue("de");
    await expect(languageCommand(asCommand(event), languages)).rejects.toThrow(
      "invalidRule",
    );
    expect(store.save).toHaveBeenCalledTimes(1);
    const registered = commands.find((c) => c.name === "settings")!;
    expect(registered.default_member_permissions).toBe(
      PermissionFlagsBits.Administrator.toString(),
    );
    expect(
      JSON.stringify(registered.options?.find((o) => o.name === "language")),
    ).toContain('"value":"fr"');
    expect(commands.map((c) => c.name)).toEqual([
      "panel",
      "rules",
      "settings",
      "roles",
      "help",
      "wallet",
    ]);
  });
});

describe("localized Discord interactions", () => {
  it("routes private help and public panels with different languages", async () => {
    const { languages } = settings();
    await languages.load();
    const store = { ensureGuild: vi.fn() };
    const help = command("help", "en-US");
    await handleCommand(
      asCommand(help),
      store,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      languages,
    );
    expect(help.editReply.mock.calls[0]![0].content).toContain(
      "Administrators configure",
    );
    const panel = command("panel", "en-US");
    await handleCommand(
      asCommand(panel),
      store,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      languages,
    );
    expect(panel.reply.mock.calls[0]![0].embeds[0].toJSON().title).toBe(
      "Vos rôles de détenteur",
    );
    const fallback = command("help", "ja");
    await handleCommand(
      asCommand(fallback),
      store,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      languages,
    );
    expect(fallback.editReply.mock.calls[0]![0].content).toContain(
      "Les administrateurs configurent",
    );
  });
  it("routes the new setting and hides persistence errors in the member's language", async () => {
    const { languages, store } = settings();
    const event = command("settings");
    await handleCommand(
      asCommand(event),
      { ensureGuild: vi.fn() },
      vi.fn(),
      undefined,
      undefined,
      undefined,
      languages,
    );
    expect(store.save).toHaveBeenCalledWith("guild", "fr");
    store.save.mockRejectedValue(new Error("secret"));
    const report = vi.fn();
    await handleCommand(
      asCommand(event),
      { ensureGuild: vi.fn() },
      report,
      undefined,
      undefined,
      undefined,
      languages,
    );
    expect(event.editReply).toHaveBeenLastCalledWith(
      "Une erreur est survenue. Réessayez plus tard.",
    );
    expect(report).toHaveBeenCalled();
  });
  it("preserves public button identifiers and safe modal lengths in both languages", async () => {
    const en = panelReply();
    const fr = withLanguage("fr", panelReply);
    const ids = (reply: ReturnType<typeof panelReply>) =>
      reply.components[0]!.toJSON().components.map((c) =>
        "custom_id" in c ? c.custom_id : "",
      );
    expect(ids(fr)).toEqual(ids(en));
    for (const lang of ["en", "fr"] as const)
      await withLanguage(lang, async () => {
        const modal = addModal(137).toJSON();
        expect(modal.custom_id).toBe("wallet:add:137");
        expect(modal.title.length).toBeLessThanOrEqual(45);
        const event = {
          customId: "wallet:verify:12345678-1234-1234-1234-123456789abc",
          guildId: "guild",
          showModal: vi.fn(),
        };
        await walletButton(
          event as unknown as ButtonInteraction,
          {} as WalletService,
        );
        const proof = event.showModal.mock.calls[0]![0].toJSON();
        expect(proof.custom_id).toBe(
          "wallet:proof:12345678-1234-1234-1234-123456789abc",
        );
        expect(proof.title.length).toBeLessThanOrEqual(45);
        for (const form of [modal, proof])
          for (const row of form.components)
            for (const c of row.components)
              expect(c.label.length).toBeLessThanOrEqual(45);
      });
  });
  it("translates proof instructions without altering amounts, addresses, expiry, network or IDs", () => {
    const challenge = {
      id: "12345678-1234-1234-1234-123456789abc",
      chainId: 137,
      address,
      amountWei: "1234567890123",
      expiresAt: new Date("2026-10-12T08:00:00Z"),
    } as Challenge;
    const reply = withLanguage("fr", () => challengeReply(challenge));
    expect(reply.content).toContain("exactement **0.000001234567890123 POL**");
    expect(reply.content).toContain(
      `De : \`${address}\`\nVers : \`${address}\``,
    );
    expect(reply.content).toContain("64 confirmations");
    expect(reply.content).toContain(
      `<t:${challenge.expiresAt.getTime() / 1000}:R>`,
    );
    expect(reply.content).toContain("n’arrondissez pas");
    expect(reply.components[0]!.toJSON().components[0]).toMatchObject({
      custom_id: `wallet:verify:${challenge.id}`,
      label: "Soumettre la transaction",
    });
  });
  it("handles old public controls privately with translated confirmations and exact token units", async () => {
    const rule: Rule = {
      id: "rule",
      guildId: "guild",
      group: "coins",
      chainId: 137,
      contract: address,
      tokenIds: [],
      minimum: "100500000",
      roleId: "role",
      assetType: "ERC20",
      decimals: 6,
    };
    const event = {
      customId: `holder:remove:${address}`,
      guildId: "guild",
      user: { id: "user" },
      deferReply: vi.fn(),
      editReply: vi.fn(),
      showModal: vi.fn(),
    };
    const wallets = { remove: vi.fn() } as unknown as WalletService;
    const roles = {
      inspect: vi.fn().mockResolvedValue({
        rules: [rule],
        counts: new Map([[rule.id, 100250000n]]),
        desired: [],
      }),
    } as unknown as RoleService;
    await withLanguage("fr", () =>
      panelButton(event as unknown as ButtonInteraction, wallets, roles),
    );
    expect(event.editReply.mock.calls[0]![0].content).toContain(
      "L’historique des preuves est conservé",
    );
    expect(
      event.editReply.mock.calls[0]![0].components[0].toJSON().components[0]
        .custom_id,
    ).toBe(`holder:confirm:${address}`);
    expect(event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    event.customId = "holder:status";
    await withLanguage("fr", () =>
      panelButton(event as unknown as ButtonInteraction, wallets, roles),
    );
    const embed = event.editReply.mock.calls.at(-1)![0].embeds[0].toJSON();
    expect(embed.title).toBe("Votre éligibilité aux rôles");
    expect(embed.fields[0].value).toContain(
      "100.25 tokens détenus · Non sélectionné",
    );
    expect(embed.fields[0].value).toContain(
      "Minimum : 100.5 tokens · 6 décimales",
    );
  });
  it("translates admin display but leaves exact rule JSON untouched", async () => {
    const rule: Rule = {
      id: "rule",
      guildId: "guild",
      group: "coins",
      chainId: 137,
      contract: address,
      tokenIds: [],
      minimum: "100500000",
      roleId: "role",
      assetType: "ERC20",
      decimals: 6,
    };
    const service = {
      repo: {
        snapshot: vi.fn().mockResolvedValue({
          rules: [rule],
          settings: { roleStacking: true },
        }),
      },
    } as unknown as RoleService;
    const event = command("rules", "fr", "list");
    await withLanguage("fr", () => roleCommand(asCommand(event), service));
    const reply = event.editReply.mock.calls[0]![0];
    expect(reply.content).toContain("Règles, page 1 · cumul : activé");
    expect(JSON.parse(reply.files[0].attachment.toString())).toEqual([
      { ...rule, minimumTokens: "100.5" },
    ]);
  });
  it("keeps Alchemy error codes internal and translates the admin form", async () => {
    const event = command("settings", "fr", "alchemy");
    await withLanguage("fr", () =>
      alchemyCommand(asCommand(event), {
        vault: { enabled: true },
      } as AlchemySettings),
    );
    const modal = event.showModal.mock.calls[0]![0].toJSON();
    expect(modal.title).toBe("Clé API Alchemy du serveur");
    expect(modal.components[0].components[0].custom_id).toBe("api-key");
    expect(modal.components[0].components[0].label.length).toBeLessThanOrEqual(
      45,
    );
    await expect(
      withLanguage("fr", () =>
        alchemyCommand(asCommand(event), {
          vault: { enabled: false },
        } as AlchemySettings),
      ),
    ).rejects.toThrow("disabled");
  });
  it("translates all domain errors and never leaks unknown SDK exceptions", () => {
    const codes: WalletError["code"][] = [
      "invalidAddress",
      "invalidHash",
      "unsupportedWallet",
      "expired",
      "notFound",
      "unavailable",
      "incorrectProof",
      "confirming",
      "limit",
      "reserved",
      "alreadyLinked",
      "rateLimited",
      "busy",
    ];
    for (const code of codes)
      expect(
        withLanguage("fr", () => walletErrorMessage(new WalletError(code))),
      ).not.toBe(walletErrorMessage(new WalletError(code)));
    const roles: RoleError["code"][] = [
      "adminOnly",
      "invalidRule",
      "notFound",
      "provider",
      "permissions",
      "busy",
      "changed",
      "partial",
      "limit",
      "memberGone",
    ];
    for (const code of roles)
      expect(
        withLanguage("fr", () => roleErrorMessage(new RoleError(code))),
      ).not.toBe(roleErrorMessage(new RoleError(code)));
    for (const code of [
      "disabled",
      "invalid",
      "unavailable",
      "locked",
    ] as const)
      expect(
        withLanguage("fr", () => alchemyErrorMessage(new AlchemyError(code))),
      ).not.toBe(alchemyErrorMessage(new AlchemyError(code)));
    expect(
      withLanguage("fr", () => walletErrorMessage(new Error("secret"))),
    ).toBe("Une erreur est survenue. Réessayez plus tard.");
  });
});
