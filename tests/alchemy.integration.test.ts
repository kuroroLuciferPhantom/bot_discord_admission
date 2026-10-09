import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/storage.js";
import { createVault } from "../src/alchemy/vault.js";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("guild Alchemy PostgreSQL", () => {
  const db = url ? createDatabase(url) : undefined,
    guilds = ["alchemy-test-a", "alchemy-test-b"];
  const master = Buffer.alloc(32, 42).toString("base64");
  afterAll(async () => {
    if (!db) return;
    await db.guildAlchemyConfig.deleteMany({
      where: { guildId: { in: guilds } },
    });
    await db.guildSettings.deleteMany({ where: { guildId: { in: guilds } } });
    await db.$disconnect();
  });
  it("persists ciphertext only, isolates guilds, replaces and deletes with revisions", async () => {
    if (!db) throw new Error("Missing test DB");
    const vault = createVault(db, master);
    expect(await vault.get(guilds[0]!)).toBeUndefined();
    await vault.save(guilds[0]!, "synthetic-key-a");
    await vault.save(guilds[1]!, "synthetic-key-b");
    expect(await vault.get(guilds[0]!)).toBe("synthetic-key-a");
    expect(await vault.get(guilds[1]!)).toBe("synthetic-key-b");
    const row = await db.guildAlchemyConfig.findUniqueOrThrow({
      where: { guildId: guilds[0]! },
    });
    expect(row.ciphertext).not.toContain("synthetic-key-a");
    await expect(createVault(db).get(guilds[0]!)).rejects.toThrow("locked");
    await expect(
      createVault(db, Buffer.alloc(32, 43).toString("base64")).get(guilds[0]!),
    ).rejects.toThrow("locked");
    await vault.save(guilds[0]!, "replacement-key");
    expect(await vault.get(guilds[0]!)).toBe("replacement-key");
    await vault.remove(guilds[0]!);
    expect(await vault.configured(guilds[0]!)).toBe(false);
    expect(await vault.get(guilds[0]!)).toBeUndefined();
    expect(await vault.get(guilds[1]!)).toBe("synthetic-key-b");
    expect(
      (
        await db.guildSettings.findUniqueOrThrow({
          where: { guildId: guilds[0]! },
        })
      ).revision,
    ).toBe(3);
  });
});
