import { describe, expect, it, vi } from "vitest";
import {
  normalizeAddress,
  parseHash,
  randomAmount,
  validateProof,
  WalletError,
  type Challenge,
  type Proof,
} from "../src/wallets/domain.js";
import { WalletService } from "../src/wallets/service.js";
import type { WalletRepository } from "../src/wallets/repository.js";
import type { ChainReader } from "../src/wallets/chain.js";
import {
  walletCommand,
  walletModal,
  challengeReply,
  walletErrorMessage,
} from "../src/discord/wallets.js";
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";

const address = "0x1111111111111111111111111111111111111111";
const hash = "0x" + "a".repeat(64);
const now = new Date("2026-10-08T18:31:00Z");
const challenge: Challenge = {
  id: "12345678-1234-1234-1234-123456789012",
  guildId: "guild-a",
  userId: "user-a",
  address,
  chainId: 1,
  amountWei: "1000000000001",
  startBlock: 100n,
  createdAt: new Date("2026-10-08T18:30:00Z"),
  expiresAt: new Date("2026-10-08T18:40:00Z"),
  status: "PENDING",
};
const proof: Proof = {
  chainId: 1,
  hash,
  from: address,
  to: address,
  value: 1000000000001n,
  input: "0x",
  status: "success",
  blockNumber: 101n,
  blockHash: "block",
  transactionBlockHash: "block",
  canonicalBlockHash: "block",
  timestamp: BigInt(now.getTime() / 1000),
  head: 112n,
};
function fixture(clock = () => now) {
  const repo = {
    begin: vi.fn().mockResolvedValue(challenge),
    find: vi.fn().mockResolvedValue(challenge),
    complete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ addresses: [address], pending: null }),
    remove: vi.fn().mockResolvedValue(true),
  } satisfies WalletRepository;
  const chain = {
    snapshot: vi
      .fn()
      .mockResolvedValue({ chainId: 1, blockNumber: 100n, code: "0x" }),
    proof: vi.fn().mockResolvedValue(proof),
  } satisfies ChainReader;
  return { repo, chain, service: new WalletService(repo, chain, clock) };
}

describe("proof validation", () => {
  it("accepts exact, fresh, confirmed self-transfers", () =>
    expect(() => validateProof(challenge, hash, proof, now)).not.toThrow());
  it.each([
    ["wrong network", { chainId: 137 }],
    ["wrong sender", { from: "0x2222222222222222222222222222222222222222" }],
    ["wrong recipient", { to: "0x2222222222222222222222222222222222222222" }],
    ["contract creation", { to: null }],
    ["rounded amount", { value: 1000000000000n }],
    ["token calldata", { input: "0xa9059cbb" }],
    ["failed receipt", { status: "reverted" }],
    ["old block", { blockNumber: 100n }],
    [
      "old timestamp",
      { timestamp: BigInt(challenge.createdAt.getTime() / 1000) - 1n },
    ],
    [
      "late inclusion",
      { timestamp: BigInt(challenge.expiresAt.getTime() / 1000) },
    ],
    ["future timestamp", { timestamp: BigInt(now.getTime() / 1000) + 1n }],
    ["reorg", { canonicalBlockHash: "different" }],
    ["inconsistent transaction", { transactionBlockHash: "different" }],
    ["wrong transaction", { hash: "0x" + "b".repeat(64) }],
  ])("rejects %s", (_name, change) =>
    expect(() =>
      validateProof(challenge, hash, { ...proof, ...change }, now),
    ).toThrow("incorrectProof"),
  );
  it("rejects insufficient Ethereum confirmations", () =>
    expect(() =>
      validateProof(challenge, hash, { ...proof, head: 111n }, now),
    ).toThrow("confirming"));
  it("requires 64 Polygon confirmations", () => {
    expect(() =>
      validateProof(
        { ...challenge, chainId: 137 },
        hash,
        { ...proof, chainId: 137, head: 163n },
        now,
      ),
    ).toThrow("confirming");
    expect(() =>
      validateProof(
        { ...challenge, chainId: 137 },
        hash,
        { ...proof, chainId: 137, head: 164n },
        now,
      ),
    ).not.toThrow();
  });
  it("rejects expired challenges at the exact deadline", () =>
    expect(() =>
      validateProof(challenge, hash, proof, challenge.expiresAt),
    ).toThrow("expired"));
  it("rejects consumed/cancelled challenges", () =>
    expect(() =>
      validateProof({ ...challenge, status: "VERIFIED" }, hash, proof, now),
    ).toThrow("notFound"));
  it("normalizes addresses and hash case without floats", () => {
    expect(normalizeAddress(" " + address + " ")).toBe(address);
    expect(parseHash("0x" + "A".repeat(64))).toBe(hash);
    expect(() => normalizeAddress("0x" + "0".repeat(40))).toThrow(
      "invalidAddress",
    );
    expect(() => normalizeAddress("private key")).toThrow("invalidAddress");
    expect(() => parseHash("https://explorer/tx/" + hash)).toThrow(
      "invalidHash",
    );
    for (let i = 0; i < 50; i++) {
      const amount = BigInt(randomAmount());
      expect(amount).toBeGreaterThanOrEqual(1000000000000n);
      expect(amount).toBeLessThan(2000000000000n);
    }
  });
});

describe("wallet service", () => {
  it("persists chain snapshot and server/user identity", async () => {
    const { repo, service } = fixture();
    await service.begin("guild-a", "user-a", address, 1);
    expect(repo.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "guild-a",
        userId: "user-a",
        address,
        chainId: 1,
        startBlock: 100n,
        now,
      }),
    );
  });
  it("refuses smart-contract or delegated wallets", async () => {
    const { repo, chain, service } = fixture();
    chain.snapshot.mockResolvedValue({
      chainId: 1,
      blockNumber: 100n,
      code: "0xef0100",
    });
    await expect(
      service.begin("guild-a", "user-a", address, 1),
    ).rejects.toThrow("unsupportedWallet");
    expect(repo.begin).not.toHaveBeenCalled();
  });
  it("rejects mismatched configured networks", async () => {
    const { chain, service } = fixture();
    chain.snapshot.mockResolvedValue({
      chainId: 137,
      blockNumber: 100n,
      code: "0x",
    });
    await expect(
      service.begin("guild-a", "user-a", address, 1),
    ).rejects.toThrow("unavailable");
  });
  it("scopes challenge retrieval and atomic completion", async () => {
    const { repo, service } = fixture();
    await expect(
      service.verify("guild-a", "user-a", challenge.id, hash),
    ).resolves.toBe(address);
    expect(repo.find).toHaveBeenCalledWith("guild-a", "user-a", challenge.id);
    expect(repo.complete).toHaveBeenCalledWith(
      "guild-a",
      "user-a",
      challenge.id,
      hash,
      now,
    );
  });
  it("never contacts RPC for missing or expired challenges", async () => {
    const { repo, chain, service } = fixture();
    repo.find.mockResolvedValue(null);
    await expect(
      service.verify("guild-b", "user-b", challenge.id, hash),
    ).rejects.toThrow("notFound");
    expect(chain.proof).not.toHaveBeenCalled();
    repo.find.mockResolvedValue({ ...challenge, expiresAt: now });
    await expect(
      service.verify("guild-a", "user-a", challenge.id, hash),
    ).rejects.toThrow("expired");
    expect(chain.proof).not.toHaveBeenCalled();
  });
  it("never links a wallet after an RPC failure", async () => {
    const { repo, chain, service } = fixture();
    chain.proof.mockRejectedValue(new WalletError("unavailable"));
    await expect(
      service.verify("guild-a", "user-a", challenge.id, hash),
    ).rejects.toThrow("unavailable");
    expect(repo.complete).not.toHaveBeenCalled();
  });
  it("rechecks expiry after RPC calls", async () => {
    let current = now;
    const { repo, chain, service } = fixture(() => current);
    chain.proof.mockImplementation(async () => {
      current = challenge.expiresAt;
      return proof;
    });
    await expect(
      service.verify("guild-a", "user-a", challenge.id, hash),
    ).rejects.toThrow("expired");
    expect(repo.complete).not.toHaveBeenCalled();
  });
  it("rate limits across guilds and resets after a minute", async () => {
    let current = now;
    const { service } = fixture(() => current);
    for (let i = 0; i < 10; i++) await service.list("guild-" + i, "user-a");
    await expect(service.list("another", "user-a")).rejects.toThrow(
      "rateLimited",
    );
    current = new Date(now.getTime() + 60_000);
    await expect(service.list("another", "user-a")).resolves.toBeDefined();
  });
  it("bounds concurrent RPC requests without an unbounded queue", async () => {
    const { chain, service } = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    chain.snapshot.mockImplementation(async () => {
      await gate;
      return { chainId: 1, blockNumber: 100n, code: "0x" };
    });
    const pending = Array.from({ length: 10 }, (_, i) =>
      service.begin("guild-a", "user-" + i, address, 1),
    );
    await expect(
      service.begin("guild-a", "extra-user", address, 1),
    ).rejects.toThrow("busy");
    release();
    await Promise.all(pending);
  });
  it("scopes removal to the current user and guild", async () => {
    const { repo, service } = fixture();
    await service.remove("guild-a", "user-a", address);
    expect(repo.remove).toHaveBeenCalledWith("guild-a", "user-a", address);
  });
});

describe("private Discord wallet UI", () => {
  it("opens the private address modal without RPC", async () => {
    const { service, chain } = fixture();
    const event = {
      guildId: "guild-a",
      user: { id: "user-a" },
      options: { getSubcommand: () => "add", getString: () => "polygon" },
      showModal: vi.fn(),
    };
    await walletCommand(
      event as unknown as ChatInputCommandInteraction,
      service,
    );
    expect(event.showModal).toHaveBeenCalled();
    expect(chain.snapshot).not.toHaveBeenCalled();
  });
  it("defers modal responses ephemerally and shows exact instructions", async () => {
    const { service } = fixture();
    const event = {
      guildId: "guild-a",
      user: { id: "user-a" },
      customId: "wallet:add:1",
      fields: { getTextInputValue: () => address },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
    await walletModal(event as unknown as ModalSubmitInteraction, service);
    expect(event.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(event.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("0.000001000000000001 ETH"),
      }),
    );
  });
  it("never reflects raw errors or secrets", () => {
    expect(walletErrorMessage(new Error("https://rpc/secret"))).not.toContain(
      "secret",
    );
    expect(challengeReply(challenge).content).toContain(
      "Never send funds to the bot",
    );
  });
});
