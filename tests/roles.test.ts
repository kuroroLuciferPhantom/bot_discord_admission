import { describe, expect, it, vi } from "vitest";
import {
  evaluate,
  ruleInput,
  RoleError,
  sourceKey,
  type Rule,
} from "../src/roles/domain.js";
import { createHoldingsReader } from "../src/roles/alchemy.js";
import { RoleService } from "../src/roles/service.js";
import { GuildGate } from "../src/roles/gate.js";
import type { RoleRepository } from "../src/roles/repository.js";
import { roleCommand } from "../src/discord/roles.js";
import { roleAllowed } from "../src/roles/discord.js";
import {
  PermissionFlagsBits,
  MessageFlags,
  type Role,
  type Guild,
  type ChatInputCommandInteraction,
} from "discord.js";
import { commands } from "../src/discord/commands.js";

const contract = "0x1111111111111111111111111111111111111111";
const low: Rule = {
  id: "low",
  guildId: "guild",
  group: "apes",
  chainId: 137,
  contract,
  tokenIds: [],
  minimum: "5",
  roleId: "111111111111111111",
};
const high: Rule = {
  ...low,
  id: "high",
  minimum: "20",
  roleId: "222222222222222222",
};
function fixture(wallets = ["wallet-a", "wallet-b"]) {
  const snapshot = {
    settings: { roleStacking: true, revision: 0 },
    rules: [low, high],
    managed: [low.roleId, high.roleId, "old-role"],
    wallets,
  };
  const repo = {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    record: vi.fn(),
    track: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    settings: vi.fn(),
  } as unknown as RoleRepository;
  const target = {
    current: new Set(["old-role"]),
    add: vi.fn(),
    remove: vi.fn(),
  };
  const gateway = {
    validate: vi.fn(),
    prepare: vi.fn().mockResolvedValue(target),
  };
  const reader = {
    read: vi
      .fn()
      .mockResolvedValue(
        new Map([["1", { balance: 10n, standard: "ERC1155" as const }]]),
      ),
  };
  return {
    snapshot,
    repo,
    target,
    gateway,
    reader,
    service: new RoleService(repo, gateway, reader),
  };
}
function page(nfts: unknown[], pageKey?: string) {
  return new Response(
    JSON.stringify({ ownedNfts: nfts, ...(pageKey ? { pageKey } : {}) }),
  );
}

describe("scheduled remove-only checks", () => {
  it("puts roleless members to sleep before reading wallets", async () => {
    const f = fixture();
    f.target.current.clear();
    await f.service.check("guild", "user");
    expect(f.reader.read).not.toHaveBeenCalled();
    expect(f.repo.record).toHaveBeenCalledWith("guild", "user", false, true);
  });
  it("puts confirmed departed members to sleep without an API call", async () => {
    const f = fixture();
    f.gateway.prepare.mockRejectedValue(new RoleError("memberGone"));
    await f.service.check("guild", "user");
    expect(f.reader.read).not.toHaveBeenCalled();
    expect(f.repo.record).toHaveBeenCalledWith("guild", "user", false, true);
  });
  it("keeps an eligible held tier without granting a missing higher tier", async () => {
    const f = fixture();
    f.snapshot.settings.roleStacking = false;
    f.target.current = new Set([low.roleId]);
    const result = await f.service.check("guild", "user");
    expect(result.desired).toEqual([low.roleId]);
    expect(f.target.add).not.toHaveBeenCalled();
    expect(f.target.remove).not.toHaveBeenCalled();
    expect(f.repo.record).toHaveBeenCalledWith("guild", "user", true, true);
  });
  it("removes an ineligible tier without downgrading to an unheld role", async () => {
    const f = fixture();
    f.target.current = new Set([high.roleId]);
    f.reader.read.mockResolvedValue(new Map());
    await f.service.check("guild", "user");
    expect(f.target.remove).toHaveBeenCalledWith(high.roleId);
    expect(f.target.add).not.toHaveBeenCalled();
    expect(f.repo.record).toHaveBeenCalledWith("guild", "user", false, true);
  });
  it("cleans obsolete managed roles without querying obsolete contracts", async () => {
    const f = fixture();
    await f.service.check("guild", "user");
    expect(f.reader.read).not.toHaveBeenCalled();
    expect(f.target.remove).toHaveBeenCalledWith("old-role");
  });
  it("preserves roles on provider errors", async () => {
    const f = fixture();
    f.target.current = new Set([low.roleId]);
    f.reader.read.mockRejectedValue(new RoleError("provider"));
    await expect(f.service.check("guild", "user")).rejects.toThrow("provider");
    expect(f.target.remove).not.toHaveBeenCalled();
    expect(f.repo.record).not.toHaveBeenCalled();
  });
  it("retries if Discord roles change during the ownership read", async () => {
    const f = fixture();
    f.target.current = new Set([low.roleId]);
    f.gateway.prepare.mockResolvedValueOnce({
      ...f.target,
      current: new Set([high.roleId]),
    });
    await expect(f.service.check("guild", "user")).rejects.toThrow("changed");
    expect(f.target.remove).not.toHaveBeenCalled();
  });
  it("reports partial removal for retry instead of marking it successful", async () => {
    const f = fixture();
    f.target.remove.mockRejectedValue(new Error("Discord down"));
    await expect(f.service.check("guild", "user")).rejects.toThrow("partial");
    expect(f.repo.track).toHaveBeenCalledWith("guild", "user", true);
    expect(f.repo.record).not.toHaveBeenCalled();
  });
});
const nft = (id = "1", balance = "8", tokenType = "ERC1155") => ({
  contract: { address: contract },
  tokenId: id,
  balance,
  tokenType,
});

describe("scheduler admin status", () => {
  it("refuses non-admins before reading status", async () => {
    const f = fixture();
    const event = {
      guildId: "guild",
      user: { id: "user" },
      commandName: "settings",
      memberPermissions: { has: () => false },
    } as unknown as ChatInputCommandInteraction;
    await expect(roleCommand(event, f.service)).rejects.toThrow("adminOnly");
  });
  it("reports only the invoking guild and replies privately", async () => {
    const f = fixture();
    f.repo.status = vi.fn().mockResolvedValue({
      active: 2,
      dormant: 3,
      due: 1,
      retrying: 1,
      lastSuccess: null,
    });
    f.service.schedulerEnabled = true;
    const event = {
      guildId: "guild",
      user: { id: "user" },
      commandName: "settings",
      memberPermissions: { has: () => true },
      options: { getSubcommand: () => "status" },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
    await roleCommand(
      event as unknown as ChatInputCommandInteraction,
      f.service,
    );
    expect(f.repo.status).toHaveBeenCalledWith("guild");
    expect(event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(event.editReply).toHaveBeenCalledWith(
      expect.stringContaining("Scheduler: enabled"),
    );
  });
});

describe("integer NFT rules", () => {
  it("counts ERC1155 copies and stacks all eligible tiers", () => {
    const inventory = new Map([
      [
        sourceKey(low),
        new Map([
          ["1", 8n],
          ["2", 17n],
        ]),
      ],
    ]);
    expect([...evaluate([low, high], inventory, true).desired]).toEqual([
      low.roleId,
      high.roleId,
    ]);
    expect(evaluate([low, high], inventory, true).counts.get(low.id)).toBe(25n);
  });
  it("selects the highest threshold independently per group", () => {
    const other = {
      ...low,
      id: "other",
      group: "cats",
      minimum: "2",
      roleId: "333333333333333333",
    };
    const inventory = new Map([[sourceKey(low), new Map([["1", 25n]])]]);
    expect([...evaluate([low, high, other], inventory, false).desired]).toEqual(
      [high.roleId, other.roleId],
    );
  });
  it("counts only selected token IDs, including zero for missing IDs", () => {
    const inventory = new Map([
      [
        sourceKey(low),
        new Map([
          ["1", 3n],
          ["2", 100n],
        ]),
      ],
    ]);
    const result = evaluate(
      [{ ...low, tokenIds: ["1", "9"] }],
      inventory,
      true,
    );
    expect(result.counts.get(low.id)).toBe(3n);
    expect(result.desired.size).toBe(0);
  });
  it("normalizes filters and supports quantities beyond JS safe integers", () => {
    const input = ruleInput({
      ...low,
      minimum: "9007199254740993",
      tokenIds: ["0x2", "1", "2"],
    });
    expect(input.tokenIds).toEqual(["1", "2"]);
    const inventory = new Map([
      [sourceKey(low), new Map([["1", 9007199254740993n]])],
    ]);
    expect(
      evaluate(
        [{ ...low, minimum: input.minimum }],
        inventory,
        true,
      ).desired.has(low.roleId),
    ).toBe(true);
  });
  it.each(["0", "-1", "1.5", "01", "1e3", (2n ** 256n).toString()])(
    "rejects invalid thresholds %s",
    (minimum) =>
      expect(() => ruleInput({ ...low, minimum })).toThrow("invalidRule"),
  );
  it("refuses unknown inventory instead of treating an outage as zero", () =>
    expect(() => evaluate([low], new Map(), true)).toThrow("provider"));
});

describe("Alchemy complete inventory", () => {
  it("paginates, filters the contract and counts token copies", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([nft()], "next"))
      .mockResolvedValueOnce(page([nft("2", "1", "ERC721")]));
    const reader = createHoldingsReader(
      { 137: "https://alchemy.test/nft/v3/test" },
      fetcher,
    );
    expect(
      await reader.read(137, "owner", contract, AbortSignal.timeout(1000)),
    ).toEqual(
      new Map([
        ["1", { balance: 8n, standard: "ERC1155" }],
        ["2", { balance: 1n, standard: "ERC721" }],
      ]),
    );
    const url = fetcher.mock.calls[1]?.[0] as URL;
    expect(url.searchParams.get("pageKey")).toBe("next");
    expect(url.searchParams.get("withMetadata")).toBe("false");
    expect(url.searchParams.get("contractAddresses[]")).toBe(contract);
  });
  it("accepts a successful empty inventory", async () => {
    const reader = createHoldingsReader(
      { 137: "https://alchemy.test" },
      vi.fn().mockResolvedValue(page([])),
    );
    expect(
      (await reader.read(137, "owner", contract, AbortSignal.timeout(1000)))
        .size,
    ).toBe(0);
  });
  it.each(
    [
      [nft("1", "bad")],
      [nft("1", "8", "UNKNOWN")],
      [nft("1", "2", "ERC721")],
      [
        {
          ...nft(),
          contract: { address: "0x2222222222222222222222222222222222222222" },
        },
      ],
      [nft(), nft()],
    ].map((nfts) => ({ nfts })),
  )("rejects malformed or duplicate NFT pages", async ({ nfts }) => {
    const reader = createHoldingsReader(
      { 137: "https://alchemy.test" },
      vi.fn().mockResolvedValue(page(nfts)),
    );
    await expect(
      reader.read(137, "owner", contract, AbortSignal.timeout(1000)),
    ).rejects.toThrow("provider");
  });
  it("rejects repeated pagination cursors", async () => {
    const reader = createHoldingsReader(
      { 137: "https://alchemy.test" },
      vi.fn().mockImplementation(() => page([], "same")),
    );
    await expect(
      reader.read(137, "owner", contract, AbortSignal.timeout(1000)),
    ).rejects.toThrow("provider");
  });
  it("rejects truncation beyond ten pages", async () => {
    let cursor = 0;
    const reader = createHoldingsReader(
      { 137: "https://alchemy.test" },
      vi.fn().mockImplementation(() => page([], String(++cursor))),
    );
    await expect(
      reader.read(137, "owner", contract, AbortSignal.timeout(1000)),
    ).rejects.toThrow("provider");
  });
  it("does not leak provider errors", async () => {
    const reader = createHoldingsReader(
      { 137: "https://alchemy.test/secret" },
      vi.fn().mockRejectedValue(new Error("secret")),
    );
    await expect(
      reader.read(137, "owner", contract, AbortSignal.timeout(1000)),
    ).rejects.toThrow("provider");
  });
});

describe("safe role synchronization", () => {
  it("never double-counts a unique ERC721 appearing in two wallets", async () => {
    const { service, reader, target } = fixture();
    reader.read.mockResolvedValue(
      new Map([["1", { balance: 1n, standard: "ERC721" as never }]]),
    );
    await expect(service.refresh("guild", "user")).rejects.toThrow("provider");
    expect(target.add).not.toHaveBeenCalled();
    expect(target.remove).not.toHaveBeenCalled();
  });
  it("sums wallets, shares queries across tiers, adds before removing and tracks active state", async () => {
    const { service, reader, target, repo } = fixture();
    await service.refresh("guild", "user");
    expect(reader.read).toHaveBeenCalledTimes(2);
    expect(target.add).toHaveBeenCalledWith(low.roleId);
    expect(target.add).toHaveBeenCalledWith(high.roleId);
    expect(target.remove).toHaveBeenCalledWith("old-role");
    expect(target.add.mock.invocationCallOrder[0]!).toBeLessThan(
      target.remove.mock.invocationCallOrder[0]!,
    );
    expect(repo.record).toHaveBeenCalledWith("guild", "user", true);
  });
  it("preserves every role when one wallet lookup fails", async () => {
    const { service, reader, gateway, target } = fixture();
    reader.read.mockRejectedValueOnce(new RoleError("provider"));
    await expect(service.refresh("guild", "user")).rejects.toThrow("provider");
    expect(gateway.prepare).not.toHaveBeenCalled();
    expect(target.remove).not.toHaveBeenCalled();
  });
  it("refuses stale config snapshots", async () => {
    const { service, repo, snapshot, target } = fixture();
    vi.mocked(repo.snapshot)
      .mockResolvedValueOnce(snapshot as never)
      .mockResolvedValueOnce({
        ...snapshot,
        settings: { ...snapshot.settings, revision: 1 },
      } as never);
    await expect(service.refresh("guild", "user")).rejects.toThrow("changed");
    expect(target.remove).not.toHaveBeenCalled();
  });
  it("with zero wallets removes only registered roles without calling Alchemy", async () => {
    const { service, reader, target, repo } = fixture([]);
    await service.refresh("guild", "user");
    expect(reader.read).not.toHaveBeenCalled();
    expect(target.remove).toHaveBeenCalledWith("old-role");
    expect(repo.record).toHaveBeenCalledWith("guild", "user", false);
  });
  it("does not remove lower tiers if an addition fails", async () => {
    const { service, target } = fixture();
    target.add.mockRejectedValue(new Error("Discord"));
    await expect(service.refresh("guild", "user")).rejects.toThrow("partial");
    expect(target.remove).not.toHaveBeenCalled();
  });
  it("enforces refresh cooldown", async () => {
    const { service } = fixture();
    await service.refresh("guild", "user");
    await expect(service.refresh("guild", "user")).rejects.toThrow("busy");
  });
  it("shares the guild gate with mutations", async () => {
    const gate = new GuildGate();
    let release!: () => void;
    const held = gate.run(
      "guild",
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await expect(gate.run("guild", async () => {})).rejects.toThrow("busy");
    release();
    await held;
    await expect(gate.run("guild", async () => {})).resolves.toBeUndefined();
  });
});

describe("admin and Discord role protections", () => {
  it("enforces admin permission at runtime before touching storage", async () => {
    const { service, repo } = fixture();
    const event = {
      commandName: "rules",
      guildId: "guild",
      user: { id: "user" },
      memberPermissions: { has: () => false },
    };
    await expect(
      roleCommand(event as unknown as ChatInputCommandInteraction, service),
    ).rejects.toThrow("adminOnly");
    expect(repo.snapshot).not.toHaveBeenCalled();
  });
  it("registers rules/settings as administrator-only", () => {
    for (const name of ["rules", "settings"])
      expect(
        commands.find((command) => command.name === name)
          ?.default_member_permissions,
      ).toBe(PermissionFlagsBits.Administrator.toString());
  });
  it("rejects dangerous, managed, everyone and high roles", () => {
    const guild = {
      id: "guild",
      members: {
        me: {
          permissions: { has: () => true },
          roles: { highest: { comparePositionTo: () => 1 } },
        },
      },
    } as unknown as Guild;
    const role = {
      id: "role",
      managed: false,
      permissions: { bitfield: 0n },
    } as unknown as Role;
    expect(roleAllowed(role, guild)).toBe(true);
    expect(roleAllowed({ ...role, id: "guild" } as Role, guild)).toBe(false);
    expect(roleAllowed({ ...role, managed: true } as Role, guild)).toBe(false);
    expect(
      roleAllowed(
        {
          ...role,
          permissions: { bitfield: PermissionFlagsBits.Administrator },
        } as Role,
        guild,
      ),
    ).toBe(false);
  });
});
