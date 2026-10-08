import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../src/storage.js";
import { createRoleRepository } from "../src/roles/repository.js";
import { createJobRepository } from "../src/jobs/repository.js";
import { weekMs } from "../src/jobs/policy.js";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("scheduled checks PostgreSQL", () => {
  const db = url ? createDatabase(url) : undefined;
  const guilds = ["jobs-test-a", "jobs-test-b"];
  // Historic clock isolates claims from other integration fixtures running in parallel.
  const now = new Date("2000-01-01T00:00:00Z");
  afterAll(async () => {
    if (!db) return;
    await db.roleMember.deleteMany({ where: { guildId: { in: guilds } } });
    await db.guildSettings.deleteMany({ where: { guildId: { in: guilds } } });
    await db.$disconnect();
  });
  it("claims concurrently, recovers expired leases and rejects stale completion", async () => {
    if (!db) throw new Error("Missing test DB");
    const jobs = createJobRepository(db);
    await db.roleMember.createMany({
      data: ["a", "b"].map((userId) => ({
        guildId: guilds[0]!,
        userId,
        active: true,
        nextCheckAt: now,
      })),
    });
    const claimed = await Promise.all([jobs.claim(now), jobs.claim(now)]);
    expect(claimed.every(Boolean)).toBe(true);
    expect(new Set(claimed.map((j) => j!.userId)).size).toBe(2);
    expect(await jobs.claim(now)).toBeNull();
    const old = claimed.find((j) => j!.userId === "a")!;
    const later = new Date(now.getTime() + 300001);
    const replacement = (await jobs.claim(later))!;
    expect(replacement.userId).toBe("a");
    expect(replacement.leaseId).not.toBe(old.leaseId);
    await jobs.fail(old, "provider", later);
    await jobs.finish(old);
    const row = await db.roleMember.findUniqueOrThrow({
      where: { guildId_userId: { guildId: old.guildId, userId: old.userId } },
    });
    expect(row.leaseId).toBe(replacement.leaseId);
    expect(row.attempts).toBe(0);
    await jobs.fail(replacement, "provider", later);
    const failed = await db.roleMember.findUniqueOrThrow({
      where: { guildId_userId: { guildId: old.guildId, userId: old.userId } },
    });
    expect(failed.lastError).toBe("provider");
    expect(failed.attempts).toBe(1);
    expect(failed.nextCheckAt!.getTime()).toBe(later.getTime() + 60000);
    expect(failed.leaseId).toBeNull();
    await db.roleMember.deleteMany({
      where: { guildId: guilds[0]!, userId: { in: ["a", "b"] } },
    });
  });
  it("manual refresh invalidates old leases and dormant members stay unqueued", async () => {
    if (!db) throw new Error("Missing test DB");
    const roles = createRoleRepository(db),
      jobs = createJobRepository(db);
    await roles.settings(guilds[0]!, {});
    await db.roleMember.create({
      data: {
        guildId: guilds[0]!,
        userId: "manual",
        active: true,
        nextCheckAt: now,
      },
    });
    const job = (await jobs.claim(now))!;
    await roles.record(guilds[0]!, "manual", true);
    await jobs.fail(job, "partial", now);
    let row = await db.roleMember.findUniqueOrThrow({
      where: { guildId_userId: { guildId: guilds[0]!, userId: "manual" } },
    });
    expect(row.lastError).toBeNull();
    expect(row.nextCheckAt!.getTime() - row.lastCheckedAt!.getTime()).toBe(
      weekMs,
    );
    await roles.record(guilds[0]!, "manual", false);
    await roles.queue(guilds[0]!, "manual");
    row = await db.roleMember.findUniqueOrThrow({
      where: { guildId_userId: { guildId: guilds[0]!, userId: "manual" } },
    });
    expect(row.active).toBe(false);
    expect(row.nextCheckAt).toBeNull();
    await roles.queue(guilds[0]!, "never-refreshed");
    expect(
      await db.roleMember.count({
        where: { guildId: guilds[0]!, userId: "never-refreshed" },
      }),
    ).toBe(0);
  });
  it("frequency changes reschedule future checks only within their guild", async () => {
    if (!db) throw new Error("Missing test DB");
    const roles = createRoleRepository(db);
    for (const guildId of guilds) {
      await roles.settings(guildId, {});
      await roles.record(guildId, "future", true);
    }
    await db.roleMember.create({
      data: {
        guildId: guilds[0]!,
        userId: "due",
        active: true,
        nextCheckAt: now,
      },
    });
    const retryAt = new Date(Date.now() + weekMs);
    await db.roleMember.create({
      data: {
        guildId: guilds[0]!,
        userId: "retry",
        active: true,
        nextCheckAt: retryAt,
        lastError: "provider",
        attempts: 1,
      },
    });
    await roles.settings(guilds[0]!, { checksPerWeek: 2 });
    for (const [index, guildId] of guilds.entries()) {
      const row = await db.roleMember.findUniqueOrThrow({
        where: { guildId_userId: { guildId, userId: "future" } },
      });
      expect(row.nextCheckAt!.getTime() - row.lastCheckedAt!.getTime()).toBe(
        weekMs / (index === 0 ? 2 : 1),
      );
    }
    const due = await db.roleMember.findUniqueOrThrow({
      where: { guildId_userId: { guildId: guilds[0]!, userId: "due" } },
    });
    const retry = await db.roleMember.findUniqueOrThrow({
      where: { guildId_userId: { guildId: guilds[0]!, userId: "retry" } },
    });
    expect(due.nextCheckAt).toEqual(now);
    expect(retry.nextCheckAt).toEqual(retryAt);
    const status = await roles.status(guilds[0]!);
    expect(status).toMatchObject({
      active: 3,
      dormant: 1,
      due: 1,
      retrying: 1,
    });
    expect(status.lastSuccess).toBeInstanceOf(Date);
  });
});
