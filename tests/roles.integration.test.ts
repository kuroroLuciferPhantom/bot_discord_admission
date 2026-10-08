import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/storage.js";
import { createRoleRepository } from "../src/roles/repository.js";
import { ruleInput } from "../src/roles/domain.js";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("role rules PostgreSQL", () => {
  const db = url ? createDatabase(url) : undefined;
  const guilds = ["rules-test-a", "rules-test-b"];
  afterAll(async () => {
    if (!db) return;
    await db.roleRule.deleteMany({ where: { guildId: { in: guilds } } });
    await db.managedRole.deleteMany({ where: { guildId: { in: guilds } } });
    await db.roleMember.deleteMany({ where: { guildId: { in: guilds } } });
    await db.guildSettings.deleteMany({ where: { guildId: { in: guilds } } });
    await db.$disconnect();
  });
  it("persists isolated rules/settings, group consistency and managed tombstones", async () => {
    if (!db) throw new Error("Missing test DB");
    const repo = createRoleRepository(db);
    const input = ruleInput({
      group: "apes",
      chainId: 137,
      contract: "0x1111111111111111111111111111111111111111",
      tokenIds: ["0x1"],
      minimum: "5",
      roleId: "111111111111111111",
    });
    const a = await repo.save(guilds[0]!, input);
    await expect(
      repo.save(guilds[0]!, {
        ...input,
        minimum: "20",
        roleId: "222222222222222222",
        tokenIds: ["2"],
      }),
    ).rejects.toThrow("invalidRule");
    await expect(repo.save(guilds[1]!, input, a.id)).rejects.toThrow(
      "notFound",
    );
    await expect(repo.remove(guilds[1]!, a.id)).rejects.toThrow("notFound");
    const b = await repo.save(guilds[0]!, {
      ...input,
      minimum: "20",
      roleId: "222222222222222222",
    });
    await repo.settings(guilds[0]!, { roleStacking: false, checksPerWeek: 2 });
    const state = await repo.snapshot(guilds[0]!, "user");
    expect(state.rules).toHaveLength(2);
    expect(state.settings.roleStacking).toBe(false);
    expect(state.settings.revision).toBe(3);
    expect((await repo.snapshot(guilds[1]!, "user")).rules).toHaveLength(0);
    await repo.remove(guilds[0]!, b.id);
    const after = await repo.snapshot(guilds[0]!, "user");
    expect(after.rules).toHaveLength(1);
    expect(after.managed).toContain(b.roleId);
    await repo.record(guilds[0]!, "user", true);
    await repo.record(guilds[0]!, "user", false);
    expect(
      (
        await db.roleMember.findUniqueOrThrow({
          where: { guildId_userId: { guildId: guilds[0]!, userId: "user" } },
        })
      ).active,
    ).toBe(false);
  });
});
