import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/storage.js";
import { createWalletRepository } from "../src/wallets/repository.js";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("wallet PostgreSQL invariants", () => {
  const db = url ? createDatabase(url) : undefined;
  const guilds = ["wallet-test-a", "wallet-test-b"];
  const address = "0x1111111111111111111111111111111111111111";
  const address2 = "0x2222222222222222222222222222222222222222";
  const hash = "0x" + "c".repeat(64);
  const now = new Date();
  afterAll(async () => {
    if (!db) return;
    await db.wallet.deleteMany({ where: { guildId: { in: guilds } } });
    await db.walletChallenge.deleteMany({ where: { guildId: { in: guilds } } });
    await db.$disconnect();
  });
  it("atomically reserves, consumes, isolates, removes and rejects replay", async () => {
    if (!db) throw new Error("Missing integration database");
    const repo = createWalletRepository(db);
    const start = (userId: string, amountWei: string) =>
      repo.begin({
        guildId: guilds[0]!,
        userId,
        address,
        chainId: 1,
        amountWei,
        startBlock: 1n,
        now,
      });
    const results = await Promise.allSettled([
      start("user-a", "1100000000001"),
      start("user-b", "1100000000002"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const winner = results.find((result) => result.status === "fulfilled");
    if (!winner || winner.status !== "fulfilled") throw new Error("No winner");
    const c = winner.value;
    expect(await repo.find(guilds[1]!, c.userId, c.id)).toBeNull();
    expect(await repo.find(guilds[0]!, "wrong-user", c.id)).toBeNull();
    await expect(
      repo.complete(guilds[0]!, "wrong-user", c.id, hash, now),
    ).rejects.toThrow();
    const completions = await Promise.allSettled([
      repo.complete(c.guildId, c.userId, c.id, hash, now),
      repo.complete(c.guildId, c.userId, c.id, hash, now),
    ]);
    expect(
      completions.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await repo.list(c.guildId, c.userId)).addresses).toEqual([address]);
    expect(await repo.remove(c.guildId, "wrong-user", address)).toBe(false);
    expect(await repo.remove(c.guildId, c.userId, address)).toBe(true);
    expect((await repo.list(c.guildId, c.userId)).addresses).toEqual([]);
    const other = await repo.begin({
      guildId: guilds[1]!,
      userId: c.userId,
      address,
      chainId: 1,
      amountWei: "1100000000003",
      startBlock: 1n,
      now,
    });
    await expect(
      repo.complete(other.guildId, other.userId, other.id, hash, now),
    ).rejects.toThrow("incorrectProof");
    expect((await repo.list(other.guildId, other.userId)).addresses).toEqual(
      [],
    );
    const stored = await repo.find(other.guildId, other.userId, other.id);
    expect(stored?.status).toBe("PENDING");
    await expect(
      repo.begin({
        guildId: c.guildId,
        userId: c.userId,
        address: address2,
        chainId: 1,
        amountWei: "1100000000004",
        startBlock: 1n,
        now,
      }),
    ).rejects.toThrow("rateLimited");
    const later = new Date(now.getTime() + 601_000);
    const renewed = await repo.begin({
      guildId: other.guildId,
      userId: "new-user",
      address,
      chainId: 1,
      amountWei: "1100000000005",
      startBlock: 2n,
      now: later,
    });
    expect(renewed.status).toBe("PENDING");
    expect(
      (await repo.find(other.guildId, other.userId, other.id))?.status,
    ).toBe("EXPIRED");
  });
  it("enforces five wallets and rejects expired completion", async () => {
    if (!db) throw new Error("Missing integration database");
    const repo = createWalletRepository(db);
    await db.wallet.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        guildId: guilds[0]!,
        userId: "limit-user",
        address: "0x" + (i + 10).toString(16).padStart(40, "0"),
        verifiedAt: now,
      })),
    });
    await expect(
      repo.begin({
        guildId: guilds[0]!,
        userId: "limit-user",
        address: address2,
        chainId: 137,
        amountWei: "1200000000001",
        startBlock: 1n,
        now,
      }),
    ).rejects.toThrow("limit");
    const c = await repo.begin({
      guildId: guilds[0]!,
      userId: "expired-user",
      address: address2,
      chainId: 137,
      amountWei: "1200000000002",
      startBlock: 1n,
      now,
    });
    await expect(
      repo.complete(
        c.guildId,
        c.userId,
        c.id,
        "0x" + "d".repeat(64),
        c.expiresAt,
      ),
    ).rejects.toThrow("expired");
  });
  it("rechecks expiry after waiting for a member lock", async () => {
    if (!db) throw new Error("Missing integration database");
    const repo = createWalletRepository(db);
    const staleNow = new Date();
    const c = await repo.begin({
      guildId: guilds[0]!,
      userId: "lock-expiry-user",
      address: "0x3333333333333333333333333333333333333333",
      chainId: 1,
      amountWei: "1300000000001",
      startBlock: 1n,
      now: new Date(staleNow.getTime() - 599_500),
    });
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const held = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c.guildId + ":" + c.userId}, 0))`;
      acquired();
      await new Promise((resolve) => setTimeout(resolve, 750));
    });
    await ready;
    const completion = repo.complete(
      c.guildId,
      c.userId,
      c.id,
      "0x" + "e".repeat(64),
      staleNow,
    );
    await expect(completion).rejects.toThrow("expired");
    await held;
    expect((await repo.list(c.guildId, c.userId)).addresses).toEqual([]);
  });
});
