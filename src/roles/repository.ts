import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { RoleError, groupSource, type RuleInput } from "./domain.js";

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
      return db.guildSettings.update({
        where: { guildId },
        data: { ...update, revision: { increment: 1 } },
      });
    },
    async record(guildId: string, userId: string, active: boolean) {
      await db.roleMember.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, active, lastCheckedAt: new Date() },
        update: { active, lastCheckedAt: new Date() },
      });
    },
  };
}
export type RoleRepository = ReturnType<typeof createRoleRepository>;
