import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { RoleError, groupSource, type RuleInput } from "./domain.js";
import { nextRegularCheck } from "../jobs/policy.js";

export function createRoleRepository(db: PrismaClient) {
  const initialize = async (guildId: string) => {
    await db.guildSettings.createMany({
      data: [{ guildId }],
      skipDuplicates: true,
    });
  };
  return {
    async snapshot(guildId: string, userId: string) {
      await initialize(guildId);
      return db.$transaction(
        async (tx) => ({
          settings: await tx.guildSettings.findUniqueOrThrow({
            where: { guildId },
          }),
          rules: await tx.roleRule.findMany({
            where: { guildId },
            orderBy: { id: "asc" },
          }),
          managed: (await tx.managedRole.findMany({ where: { guildId } })).map(
            (role) => role.roleId,
          ),
          wallets: (
            await tx.wallet.findMany({
              where: { guildId, userId, active: true },
              orderBy: { address: "asc" },
            })
          ).map((wallet) => wallet.address),
        }),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    },
    async save(guildId: string, input: RuleInput, id?: string) {
      await initialize(guildId);
      try {
        return await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"rules:" + guildId},0))`;
          if (id && !(await tx.roleRule.findFirst({ where: { id, guildId } })))
            throw new RoleError("notFound");
          const group = await tx.roleRule.findFirst({
            where: {
              guildId,
              group: input.group,
              ...(id ? { id: { not: id } } : {}),
            },
          });
          if (group && groupSource(group) !== groupSource(input))
            throw new RoleError("invalidRule");
          if (!id && (await tx.roleRule.count({ where: { guildId } })) >= 20)
            throw new RoleError("limit");
          const result = id
            ? await tx.roleRule.update({ where: { id }, data: input })
            : await tx.roleRule.create({ data: { guildId, ...input } });
          await tx.managedRole.createMany({
            data: [{ guildId, roleId: input.roleId }],
            skipDuplicates: true,
          });
          await tx.guildSettings.update({
            where: { guildId },
            data: { revision: { increment: 1 } },
          });
          return result;
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new RoleError("invalidRule");
        throw error;
      }
    },
    async remove(guildId: string, id: string) {
      return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"rules:" + guildId},0))`;
        const result = await tx.roleRule.deleteMany({ where: { guildId, id } });
        if (!result.count) throw new RoleError("notFound");
        await tx.guildSettings.update({
          where: { guildId },
          data: { revision: { increment: 1 } },
        });
      });
    },
    async settings(
      guildId: string,
      update: { roleStacking?: boolean; checksPerWeek?: number },
    ) {
      await initialize(guildId);
      return db.$transaction(async (tx) => {
        const settings = await tx.guildSettings.update({
          where: { guildId },
          data: { ...update, revision: { increment: 1 } },
        });
        if (update.checksPerWeek !== undefined) {
          await tx.$executeRaw`UPDATE "RoleMember" SET "nextCheckAt" = COALESCE("lastCheckedAt", CURRENT_TIMESTAMP) + (${settings.checksPerWeek === 2 ? 302400000 : 604800000} * INTERVAL '1 millisecond') WHERE "guildId" = ${guildId} AND "active" AND "leaseId" IS NULL AND "lastError" IS NULL AND "nextCheckAt" > CURRENT_TIMESTAMP`;
        }
        return settings;
      });
    },
    async track(guildId: string, userId: string, active: boolean) {
      await db.roleMember.createMany({
        data: [{ guildId, userId, active }],
        skipDuplicates: true,
      });
      await db.roleMember.update({
        where: { guildId_userId: { guildId, userId } },
        data: { active, nextCheckAt: active ? new Date() : null },
      });
    },
    async queue(guildId: string, userId: string) {
      await db.roleMember.updateMany({
        where: { guildId, userId, active: true },
        data: {
          nextCheckAt: new Date(),
          leaseId: null,
          leaseUntil: null,
          attempts: 0,
          lastError: null,
        },
      });
    },
    async status(guildId: string) {
      const [active, dormant, due, retrying, checked] = await Promise.all([
        db.roleMember.count({ where: { guildId, active: true } }),
        db.roleMember.count({ where: { guildId, active: false } }),
        db.roleMember.count({
          where: { guildId, active: true, nextCheckAt: { lte: new Date() } },
        }),
        db.roleMember.count({
          where: { guildId, active: true, lastError: { not: null } },
        }),
        db.roleMember.aggregate({
          where: { guildId },
          _max: { lastCheckedAt: true },
        }),
      ]);
      return {
        active,
        dormant,
        due,
        retrying,
        lastSuccess: checked._max.lastCheckedAt,
      };
    },
    async record(
      guildId: string,
      userId: string,
      active: boolean,
      scheduled = false,
    ) {
      const settings = await db.guildSettings.findUnique({
        where: { guildId },
      });
      const now = new Date();
      const data = {
        active,
        lastCheckedAt: now,
        nextCheckAt: active
          ? nextRegularCheck(now, settings?.checksPerWeek ?? 1)
          : null,
        ...(!scheduled
          ? { leaseId: null, leaseUntil: null, attempts: 0, lastError: null }
          : {}),
      };
      await db.roleMember.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, ...data },
        update: data,
      });
    },
  };
}
export type RoleRepository = ReturnType<typeof createRoleRepository>;
