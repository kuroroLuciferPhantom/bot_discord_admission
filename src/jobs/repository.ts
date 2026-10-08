import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { retryDelay } from "./policy.js";
export type Lease = {
  guildId: string;
  userId: string;
  leaseId: string;
  attempts: number;
};
export interface JobRepository {
  claim(now: Date): Promise<Lease | null>;
  finish(job: Lease): Promise<void>;
  fail(job: Lease, code: string, now: Date): Promise<void>;
}
export function createJobRepository(db: PrismaClient): JobRepository {
  return {
    async claim(now) {
      const leaseId = randomUUID(),
        until = new Date(now.getTime() + 300_000);
      const rows = await db.$queryRaw<Lease[]>`
        UPDATE "RoleMember" m SET "leaseId"=${leaseId}, "leaseUntil"=${until}
        FROM (SELECT "guildId","userId" FROM "RoleMember"
          WHERE "active" AND "nextCheckAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" <= ${now})
          ORDER BY "nextCheckAt","guildId","userId" LIMIT 1 FOR UPDATE SKIP LOCKED) candidate
        WHERE m."guildId"=candidate."guildId" AND m."userId"=candidate."userId"
        RETURNING m."guildId",m."userId",m."leaseId",m."attempts"`;
      return rows[0] ?? null;
    },
    async finish(job) {
      // RoleService already persisted the next regular interval or dormancy.
      await db.roleMember.updateMany({
        where: {
          guildId: job.guildId,
          userId: job.userId,
          leaseId: job.leaseId,
        },
        data: { leaseId: null, leaseUntil: null, attempts: 0, lastError: null },
      });
    },
    async fail(job, code, now) {
      await db.roleMember.updateMany({
        where: {
          guildId: job.guildId,
          userId: job.userId,
          leaseId: job.leaseId,
        },
        data: {
          leaseId: null,
          leaseUntil: null,
          attempts: Math.min(job.attempts + 1, 100),
          lastError: code,
          nextCheckAt: new Date(now.getTime() + retryDelay(job.attempts, code)),
        },
      });
    },
  };
}
