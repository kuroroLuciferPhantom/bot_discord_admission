import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { WalletError, type Challenge, type ChainId } from "./domain.js";

export interface WalletRepository {
  begin(input: {
    guildId: string;
    userId: string;
    address: string;
    chainId: ChainId;
    amountWei: string;
    startBlock: bigint;
    now: Date;
  }): Promise<Challenge>;
  find(guildId: string, userId: string, id: string): Promise<Challenge | null>;
  complete(
    guildId: string,
    userId: string,
    id: string,
    hash: string,
    now: Date,
  ): Promise<void>;
  list(
    guildId: string,
    userId: string,
  ): Promise<{ addresses: string[]; pending: Challenge | null }>;
  remove(guildId: string, userId: string, address: string): Promise<boolean>;
}
type Tx = Prisma.TransactionClient;
const lockMember = async (tx: Tx, guildId: string, userId: string) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${guildId + ":" + userId}, 0))`;
};
export function createWalletRepository(db: PrismaClient): WalletRepository {
  return {
    async begin(input) {
      try {
        return await db.$transaction(async (tx) => {
          await lockMember(tx, input.guildId, input.userId);
          await tx.walletChallenge.updateMany({
            where: {
              guildId: input.guildId,
              status: "PENDING",
              expiresAt: { lte: input.now },
            },
            data: { status: "EXPIRED" },
          });
          const where = { guildId: input.guildId, userId: input.userId };
          const recent = await tx.walletChallenge.count({
            where: {
              ...where,
              createdAt: { gte: new Date(input.now.getTime() - 3600_000) },
            },
          });
          if (recent >= 10) throw new WalletError("rateLimited");
          const last = await tx.walletChallenge.findFirst({
            where,
            orderBy: { createdAt: "desc" },
          });
          if (last && input.now.getTime() - last.createdAt.getTime() < 60_000)
            throw new WalletError("rateLimited");
          const existing = await tx.wallet.findUnique({
            where: {
              guildId_address: {
                guildId: input.guildId,
                address: input.address,
              },
            },
          });
          if (existing?.active)
            throw new WalletError(
              existing.userId === input.userId ? "alreadyLinked" : "reserved",
            );
          if (
            (await tx.wallet.count({ where: { ...where, active: true } })) >= 5
          )
            throw new WalletError("limit");
          const pending = await tx.walletChallenge.findFirst({
            where: {
              guildId: input.guildId,
              address: input.address,
              status: "PENDING",
            },
          });
          if (pending && pending.userId !== input.userId)
            throw new WalletError("reserved");
          await tx.walletChallenge.updateMany({
            where: { ...where, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          return tx.walletChallenge.create({
            data: {
              guildId: input.guildId,
              userId: input.userId,
              address: input.address,
              chainId: input.chainId,
              amountWei: input.amountWei,
              startBlock: input.startBlock,
              createdAt: input.now,
              expiresAt: new Date(input.now.getTime() + 600_000),
            },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new WalletError("reserved");
        throw error;
      }
    },
    async find(guildId, userId, id) {
      return db.walletChallenge.findFirst({ where: { id, guildId, userId } });
    },
    async complete(guildId, userId, id, hash, now) {
      try {
        await db.$transaction(async (tx) => {
          await lockMember(tx, guildId, userId);
          const challenge = await tx.walletChallenge.findFirst({
            where: {
              id,
              guildId,
              userId,
              status: "PENDING",
              expiresAt: { gt: now },
            },
          });
          if (!challenge) throw new WalletError("expired");
          const existing = await tx.wallet.findUnique({
            where: { guildId_address: { guildId, address: challenge.address } },
          });
          if (existing?.active && existing.userId !== userId)
            throw new WalletError("reserved");
          if (
            (await tx.wallet.count({
              where: { guildId, userId, active: true },
            })) >= 5
          )
            throw new WalletError("limit");
          // The uniqueness constraint on (chainId, transactionHash) is never deleted when a wallet is removed.
          await tx.walletChallenge.update({
            where: { id },
            data: { status: "VERIFIED", transactionHash: hash },
          });
          await tx.wallet.upsert({
            where: { guildId_address: { guildId, address: challenge.address } },
            create: {
              guildId,
              userId,
              address: challenge.address,
              verifiedAt: now,
            },
            update: { userId, active: true, verifiedAt: now },
          });
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new WalletError("incorrectProof");
        throw error;
      }
    },
    async list(guildId, userId) {
      const [wallets, pending] = await Promise.all([
        db.wallet.findMany({
          where: { guildId, userId, active: true },
          orderBy: { verifiedAt: "asc" },
        }),
        db.walletChallenge.findFirst({
          where: {
            guildId,
            userId,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        }),
      ]);
      return { addresses: wallets.map((wallet) => wallet.address), pending };
    },
    async remove(guildId, userId, address) {
      return db.$transaction(async (tx) => {
        await lockMember(tx, guildId, userId);
        await tx.walletChallenge.updateMany({
          where: { guildId, userId, address, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        const result = await tx.wallet.updateMany({
          where: { guildId, userId, address, active: true },
          data: { active: false },
        });
        return result.count > 0;
      });
    },
  };
}
