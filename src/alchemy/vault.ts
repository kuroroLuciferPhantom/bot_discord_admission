import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";

export class AlchemyError extends Error {
  constructor(
    public readonly code: "disabled" | "invalid" | "unavailable" | "locked",
  ) {
    super(code);
  }
}
export function apiKey(input: string) {
  const key = input.trim();
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(key)) throw new AlchemyError("invalid");
  return key;
}
export function createCipher(master: string) {
  const key = Buffer.from(master, "base64");
  if (key.length !== 32 || key.toString("base64") !== master)
    throw new AlchemyError("disabled");
  const aad = (guildId: string) => Buffer.from("holder-alchemy:v1:" + guildId);
  return {
    seal(guildId: string, value: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(guildId));
      const encrypted = Buffer.concat([
        cipher.update(apiKey(value), "utf8"),
        cipher.final(),
      ]);
      return [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64"),
      ].join(".");
    },
    open(guildId: string, envelope: string) {
      try {
        const [version, iv, tag, ciphertext, extra] = envelope.split(".");
        if (
          version !== "v1" ||
          !iv ||
          !tag ||
          !ciphertext ||
          extra !== undefined ||
          envelope.length > 500
        )
          throw new Error();
        const nonce = Buffer.from(iv, "base64"),
          authTag = Buffer.from(tag, "base64");
        if (nonce.length !== 12 || authTag.length !== 16) throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAAD(aad(guildId));
        decipher.setAuthTag(authTag);
        return apiKey(
          Buffer.concat([
            decipher.update(Buffer.from(ciphertext, "base64")),
            decipher.final(),
          ]).toString("utf8"),
        );
      } catch {
        throw new AlchemyError("locked");
      }
    },
  };
}
export interface AlchemyVault {
  enabled: boolean;
  get(guildId: string): Promise<string | undefined>;
  configured(guildId: string): Promise<boolean>;
  save(guildId: string, key: string): Promise<void>;
  remove(guildId: string): Promise<void>;
}
export function createVault(db: PrismaClient, master?: string): AlchemyVault {
  const cipher = master ? createCipher(master) : undefined;
  return {
    enabled: !!cipher,
    async get(guildId) {
      const row = await db.guildAlchemyConfig.findUnique({
        where: { guildId },
      });
      if (!row) return undefined;
      if (!cipher) throw new AlchemyError("locked");
      return cipher.open(guildId, row.ciphertext);
    },
    async configured(guildId) {
      return !!(await db.guildAlchemyConfig.findUnique({
        where: { guildId },
        select: { guildId: true },
      }));
    },
    async save(guildId, value) {
      if (!cipher) throw new AlchemyError("disabled");
      const ciphertext = cipher.seal(guildId, value);
      await db.$transaction(async (tx) => {
        await tx.guildSettings.createMany({
          data: [{ guildId }],
          skipDuplicates: true,
        });
        await tx.guildAlchemyConfig.upsert({
          where: { guildId },
          create: { guildId, ciphertext },
          update: { ciphertext },
        });
        await tx.guildSettings.update({
          where: { guildId },
          data: { revision: { increment: 1 } },
        });
      });
    },
    async remove(guildId) {
      await db.$transaction(async (tx) => {
        await tx.guildSettings.createMany({
          data: [{ guildId }],
          skipDuplicates: true,
        });
        await tx.guildAlchemyConfig.deleteMany({ where: { guildId } });
        await tx.guildSettings.update({
          where: { guildId },
          data: { revision: { increment: 1 } },
        });
      });
    },
  };
}
