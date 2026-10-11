import { describe, expect, it, vi } from "vitest";
import {
  type ChatInputCommandInteraction,
  type APIApplicationCommandOption,
} from "discord.js";
import { createTokenReader } from "../src/roles/erc20.js";
import {
  evaluate,
  ruleInput,
  ruleQuantity,
  sourceKey,
  tokenMinimum,
  type Rule,
} from "../src/roles/domain.js";
import { RoleService } from "../src/roles/service.js";
import type { RoleRepository } from "../src/roles/repository.js";
import { roleCommand } from "../src/discord/roles.js";
import { commands } from "../src/discord/commands.js";

const contract = "0x1111111111111111111111111111111111111111";
const owners = [
  "0x2222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333",
];
const raw = (value: bigint) => "0x" + value.toString(16).padStart(64, "0");
const blockHash = "0x" + "a".repeat(64);
const block = { blockHash, requireCanonical: true };
type Request = { id: number; method: string; params: unknown[] };
function rpcMock(override?: (request: Request) => unknown) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as Request;
    let result: unknown = {
      eth_chainId: "0x89",
      eth_blockNumber: "0x64",
      eth_getCode: "0x6000",
      eth_getBlockByNumber: { number: "0x64", hash: blockHash },
    }[request.method];
    if (request.method === "eth_call") {
      const data = (request.params[0] as { data: string }).data;
      result =
        data === "0x313ce567"
          ? raw(6n)
          : raw(data.endsWith(owners[0]!.slice(2)) ? 100_250_000n : 500_000n);
    }
    const changed = override?.(request);
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        ...(changed !== undefined ? (changed as object) : { result }),
      }),
    );
  });
}
const nft: Rule = {
  id: "nft",
  guildId: "guild",
  group: "apes",
  chainId: 137,
  contract,
  tokenIds: [],
  minimum: "1",
  roleId: "111111111111111111",
  assetType: "NFT",
  decimals: null,
};
const token: Rule = {
  ...nft,
  id: "token",
  group: "coins",
  minimum: "100500000",
  roleId: "222222222222222222",
  assetType: "ERC20",
  decimals: 6,
};
function serviceFixture(wallets = owners) {
  const snapshot = {
    settings: { roleStacking: true, revision: 0 },
    rules: [nft, token],
    managed: [nft.roleId, token.roleId],
    wallets,
  };
  const repo = {
    snapshot: vi.fn().mockResolvedValue(snapshot),
    record: vi.fn(),
    track: vi.fn(),
    save: vi.fn().mockResolvedValue(token),
  } as unknown as RoleRepository;
  const target = {
    current: new Set([token.roleId]),
    add: vi.fn(),
    remove: vi.fn(),
  };
  const gateway = {
    prepare: vi.fn().mockResolvedValue(target),
    validate: vi.fn(),
  };
  const holdings = {
    read: vi
      .fn()
      .mockResolvedValue(
        new Map([["1", { balance: 1n, standard: "ERC1155" }]]),
      ),
  };
  const tokens = {
    decimals: vi.fn().mockResolvedValue(6),
    read: vi.fn().mockResolvedValue(100_750_000n),
  };
  return {
    snapshot,
    repo,
    target,
    gateway,
    holdings,
    tokens,
    service: new RoleService(repo, gateway, holdings, tokens),
  };
}

describe("exact token thresholds", () => {
  it.each([
    ["100.5", 6, "100500000"],
    ["0.000000000000000001", 18, "1"],
    ["9007199254740993.125", 6, "9007199254740993125000"],
    ["25", 0, "25"],
    ["0." + "0".repeat(254) + "1", 255, "1"],
  ])(
    "converts %s at %s decimals without floating point",
    (value, decimals, expected) => {
      expect(tokenMinimum(value as string, decimals as number)).toBe(expected);
    },
  );
  it.each([
    "0",
    "0.000000",
    "-1",
    "1.0000001",
    "01",
    "1e3",
    "1,5",
    ".5",
    "1.",
    " 1",
    "0x1",
    (2n ** 256n).toString(),
  ])("rejects invalid or inexact input %s", (minimum) => {
    expect(() => ruleInput({ ...token, minimum })).toThrow("invalidRule");
  });
  it.each([-1, 256, 1.5, null, undefined])(
    "rejects invalid precision %s",
    (decimals) => {
      expect(() => tokenMinimum("1", decimals as number)).toThrow(
        "invalidRule",
      );
    },
  );
  it("refuses NFT filters on tokens and precision on NFT rules", () => {
    expect(() =>
      ruleInput({ ...token, minimum: "100.5", tokenIds: ["1"] }),
    ).toThrow("invalidRule");
    expect(() => ruleInput({ ...nft, decimals: 6 })).toThrow("invalidRule");
    expect(ruleInput({ ...nft, assetType: undefined } as never).assetType).toBe(
      "NFT",
    );
  });
  it("formats balances and thresholds in token units", () => {
    const input = ruleInput({ ...token, minimum: "100.500000" });
    expect(input.minimum).toBe("100500000");
    expect(ruleQuantity(input, input.minimum)).toBe("100.5");
    expect(ruleQuantity(nft, 42n)).toBe("42");
  });
  it("does not mix NFT and token inventories for the same address", () => {
    const inventory = new Map([
      [sourceKey(nft), new Map([["1", 1n]])],
      [sourceKey(token), new Map([["balance", 100500000n]])],
    ]);
    expect(sourceKey(nft)).not.toBe(sourceKey(token));
    expect([...evaluate([nft, token], inventory, false).desired]).toEqual([
      nft.roleId,
      token.roleId,
    ]);
  });
});

describe("read-only ERC-20 RPC", () => {
  it("sums all wallets at the same explicit block and verifies token precision", async () => {
    const fetcher = rpcMock();
    const reader = createTokenReader(
      { 137: "https://rpc.test/secret" },
      fetcher,
    );
    expect(
      await reader.read(
        137,
        contract,
        [...owners, owners[0]!],
        6,
        AbortSignal.timeout(1000),
      ),
    ).toBe(100750000n);
    const requests = fetcher.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)) as Request,
    );
    expect(requests.filter((r) => r.method === "eth_call")).toHaveLength(3);
    expect(
      requests.filter((r) => r.method === "eth_call").map((r) => r.params[1]),
    ).toEqual([block, block, block]);
    expect(
      requests.filter((r) => r.method === "eth_getCode")[0]?.params,
    ).toEqual([contract, block]);
    expect(
      requests.every((r) =>
        [
          "eth_chainId",
          "eth_blockNumber",
          "eth_getBlockByNumber",
          "eth_getCode",
          "eth_call",
        ].includes(r.method),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.every(([, init]) => init?.redirect === "error"),
    ).toBe(true);
  });
  it("reads decimals from the contract instead of assuming eighteen", async () => {
    expect(
      await createTokenReader({ 137: "https://rpc.test" }, rpcMock()).decimals(
        137,
        contract,
        AbortSignal.timeout(1000),
      ),
    ).toBe(6);
  });
  it("also supports Ethereum and contracts with more than 10 KB of bytecode", async () => {
    const fetcher = rpcMock((r) =>
      r.method === "eth_chainId"
        ? { result: "0x1" }
        : r.method === "eth_getCode"
          ? { result: "0x" + "60".repeat(12000) }
          : undefined,
    );
    expect(
      await createTokenReader({ 1: "https://rpc.test" }, fetcher).read(
        1,
        contract,
        owners,
        6,
        AbortSignal.timeout(1000),
      ),
    ).toBe(100750000n);
  });
  it("preserves roles when a canonical snapshot is no longer available", async () => {
    let reads = 0;
    const fetcher = rpcMock((r) =>
      r.method === "eth_call" && ++reads === 3
        ? { error: { code: -32000, message: "block is no longer canonical" } }
        : undefined,
    );
    await expect(
      createTokenReader({ 137: "https://rpc.test" }, fetcher).read(
        137,
        contract,
        owners,
        6,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("provider");
  });
  it("accepts an actual zero balance", async () => {
    const fetcher = rpcMock((r) =>
      r.method === "eth_call" &&
      (r.params[0] as { data: string }).data !== "0x313ce567"
        ? { result: raw(0n) }
        : undefined,
    );
    expect(
      await createTokenReader({ 137: "https://rpc.test" }, fetcher).read(
        137,
        contract,
        owners,
        6,
        AbortSignal.timeout(1000),
      ),
    ).toBe(0n);
  });
  it.each([
    "wrong-chain",
    "wrong-block",
    "no-code",
    "empty-balance",
    "short-balance",
    "oversized-word",
    "changed-decimals",
    "missing-decimals",
    "wrong-id",
    "provider-error",
  ])("rejects %s instead of treating it as a zero balance", async (mode) => {
    const fetcher = rpcMock((r) => {
      if (mode === "wrong-chain" && r.method === "eth_chainId")
        return { result: "0x1" };
      if (mode === "wrong-block" && r.method === "eth_getBlockByNumber")
        return { result: { number: "0x65", hash: blockHash } };
      if (mode === "no-code" && r.method === "eth_getCode")
        return { result: "0x" };
      if (mode === "wrong-id") return { id: 2, result: "0x89" };
      if (mode === "provider-error")
        return { error: { message: "private-url" } };
      if (r.method !== "eth_call") return undefined;
      const metadata = (r.params[0] as { data: string }).data === "0x313ce567";
      if (mode === "changed-decimals" && metadata) return { result: raw(18n) };
      if (mode === "missing-decimals" && metadata)
        return { error: { message: "reverted" } };
      if (metadata) return undefined;
      if (mode === "empty-balance") return { result: "0x" };
      if (mode === "short-balance") return { result: "0x00" };
      if (mode === "oversized-word") return { result: "0x" + "f".repeat(66) };
      return undefined;
    });
    await expect(
      createTokenReader({ 137: "https://rpc.test/secret" }, fetcher).read(
        137,
        contract,
        owners,
        6,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow(/^provider$/);
  });
  it("refuses a missing endpoint and never queries an empty wallet set", async () => {
    const fetcher = rpcMock();
    const reader = createTokenReader({}, fetcher);
    await expect(
      reader.read(137, contract, owners, 6, AbortSignal.timeout(1000)),
    ).rejects.toThrow("provider");
    expect(
      await reader.read(137, contract, [], 6, AbortSignal.timeout(1000)),
    ).toBe(0n);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sanitizes RPC exceptions and respects cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createTokenReader({ 137: "https://rpc.test/secret" }, rpcMock()).read(
        137,
        contract,
        owners,
        6,
        controller.signal,
      ),
    ).rejects.toThrow(/^provider$/);
    await expect(
      createTokenReader(
        { 137: "https://rpc.test/secret" },
        vi.fn().mockRejectedValue(new Error("secret")),
      ).decimals(137, contract, AbortSignal.timeout(1000)),
    ).rejects.toThrow(/^provider$/);
  });
});

describe("combined NFT and token roles", () => {
  it("refreshes both standards with shared multi-wallet tier queries", async () => {
    const f = serviceFixture();
    f.snapshot.rules.push({
      ...token,
      id: "higher",
      minimum: "200000000",
      roleId: "333333333333333333",
    });
    const result = await f.service.refresh("guild", "user");
    expect(result.desired).toEqual([nft.roleId, token.roleId]);
    expect(f.tokens.read).toHaveBeenCalledExactlyOnceWith(
      137,
      contract,
      owners,
      6,
      expect.any(AbortSignal),
    );
    expect(f.holdings.read).toHaveBeenCalledTimes(2);
    expect(f.target.add).toHaveBeenCalledWith(nft.roleId);
  });
  it("does not touch roles if a token source fails after NFT reads", async () => {
    const f = serviceFixture();
    f.tokens.read.mockRejectedValue(new Error("provider"));
    await expect(f.service.refresh("guild", "user")).rejects.toThrow(
      "provider",
    );
    expect(f.gateway.prepare).not.toHaveBeenCalled();
    expect(f.target.add).not.toHaveBeenCalled();
    expect(f.target.remove).not.toHaveBeenCalled();
  });
  it("never shares balances with a stale decimal configuration in another group", async () => {
    const f = serviceFixture();
    f.snapshot.rules = [
      {
        ...token,
        id: "new",
        group: "new-coins",
        decimals: 18,
        minimum: "100500000000000000000",
      },
      token,
    ];
    f.tokens.read.mockImplementation(
      async (_chain, _contract, _owners, decimals) => {
        if (decimals === 6) throw new Error("provider");
        return 101000000000000000000n;
      },
    );
    await expect(f.service.refresh("guild", "user")).rejects.toThrow(
      "provider",
    );
    expect(f.tokens.read).toHaveBeenCalledTimes(2);
    expect(f.target.add).not.toHaveBeenCalled();
    expect(f.target.remove).not.toHaveBeenCalled();
  });
  it("scheduled checks remove a lost token tier without granting NFT roles", async () => {
    const f = serviceFixture();
    f.tokens.read.mockResolvedValue(0n);
    await f.service.check("guild", "user");
    expect(f.holdings.read).not.toHaveBeenCalled();
    expect(f.target.add).not.toHaveBeenCalled();
    expect(f.target.remove).toHaveBeenCalledExactlyOnceWith(token.roleId);
    expect(f.repo.record).toHaveBeenCalledWith("guild", "user", false, true);
  });
  it("read-only status returns token amounts without role effects", async () => {
    const f = serviceFixture();
    const result = await f.service.inspect("guild", "user");
    expect(result.counts.get(token.id)).toBe(100750000n);
    expect(f.target.add).not.toHaveBeenCalled();
    expect(f.target.remove).not.toHaveBeenCalled();
    expect(f.repo.record).not.toHaveBeenCalled();
  });
  it("zero wallets remove held roles without resolving any provider", async () => {
    const f = serviceFixture([]);
    const resolve = vi.fn().mockRejectedValue(new Error("locked"));
    const service = new RoleService(f.repo, f.gateway, f.holdings, resolve);
    await service.refresh("guild", "user");
    expect(resolve).not.toHaveBeenCalled();
    expect(f.target.remove).toHaveBeenCalledWith(token.roleId);
  });
});

describe("token admin commands", () => {
  function event(kind = "erc20", filter: string | null = null) {
    const options: Record<string, string | null> = {
      group: "coins",
      network: "polygon",
      contract,
      minimum: "100.5",
      "asset-type": kind,
      "token-ids": filter,
    };
    return {
      commandName: "rules",
      guildId: "guild",
      user: { id: "admin" },
      memberPermissions: { has: () => true },
      options: {
        getSubcommand: () => "add",
        getString: (name: string) => options[name] ?? null,
        getRole: () => ({ id: token.roleId }),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
  }
  it("registers an optional English asset selector after required fields", () => {
    const ruleCommand = commands.find((c) => c.name === "rules")!;
    const add = ruleCommand.options![0] as APIApplicationCommandOption & {
      options: APIApplicationCommandOption[];
    };
    const option = add.options.find((o) => o.name === "asset-type")!;
    expect(option.required).not.toBe(true);
    expect("choices" in option && option.choices?.map((c) => c.value)).toEqual([
      "nft",
      "erc20",
    ]);
  });
  it("reads token metadata then stores the canonical integer threshold", async () => {
    const f = serviceFixture();
    const interaction = event();
    await roleCommand(
      interaction as unknown as ChatInputCommandInteraction,
      f.service,
    );
    expect(f.tokens.decimals).toHaveBeenCalledWith(
      137,
      contract,
      expect.any(AbortSignal),
    );
    expect(f.repo.save).toHaveBeenCalledWith(
      "guild",
      expect.objectContaining({
        assetType: "ERC20",
        decimals: 6,
        minimum: "100500000",
        tokenIds: [],
      }),
      undefined,
    );
  });
  it("rejects NFT filters and unknown types before RPC or persistence", async () => {
    for (const interaction of [event("erc20", "1"), event("erc721")]) {
      const f = serviceFixture();
      await expect(
        roleCommand(
          interaction as unknown as ChatInputCommandInteraction,
          f.service,
        ),
      ).rejects.toThrow("invalidRule");
      expect(f.tokens.decimals).not.toHaveBeenCalled();
      expect(f.repo.save).not.toHaveBeenCalled();
    }
  });
  it("does not save a rule if metadata is unavailable", async () => {
    const f = serviceFixture();
    f.tokens.decimals.mockRejectedValue(new Error("provider"));
    await expect(
      roleCommand(event() as unknown as ChatInputCommandInteraction, f.service),
    ).rejects.toThrow("provider");
    expect(f.repo.save).not.toHaveBeenCalled();
  });
});
