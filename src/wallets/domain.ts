import { randomInt } from "node:crypto";
import { getAddress, isAddress, type Hash } from "viem";

export type ChainId = 1 | 137;
export const chainPolicy = {
  1: { name: "Ethereum", symbol: "ETH", confirmations: 12n },
  137: { name: "Polygon", symbol: "POL", confirmations: 64n },
} as const;
export class WalletError extends Error {
  constructor(
    public readonly code:
      | "invalidAddress"
      | "invalidHash"
      | "unsupportedWallet"
      | "expired"
      | "notFound"
      | "unavailable"
      | "incorrectProof"
      | "confirming"
      | "limit"
      | "reserved"
      | "alreadyLinked"
      | "rateLimited"
      | "busy",
  ) {
    super(code);
  }
}
export function normalizeAddress(value: string) {
  const address = value.trim();
  if (!isAddress(address, { strict: true }) || /^0x0{40}$/i.test(address))
    throw new WalletError("invalidAddress");
  return getAddress(address).toLowerCase();
}
export function parseHash(value: string): Hash {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new WalletError("invalidHash");
  return value.toLowerCase() as Hash;
}
export function randomAmount() {
  // 40 bits of random precision in a small, wallet-editable 18-decimal native amount.
  return (1_000_000_000_000n + BigInt(randomInt(1_000_000_000_000))).toString();
}
export type Challenge = {
  id: string;
  guildId: string;
  userId: string;
  address: string;
  chainId: number;
  amountWei: string;
  startBlock: bigint;
  createdAt: Date;
  expiresAt: Date;
  status: string;
};
export type ChainSnapshot = {
  chainId: number;
  blockNumber: bigint;
  code: string;
};
export type Proof = {
  chainId: number;
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  input: string;
  status: string;
  blockNumber: bigint;
  blockHash: string;
  transactionBlockHash: string | null;
  canonicalBlockHash: string;
  timestamp: bigint;
  head: bigint;
};
export function validateProof(
  challenge: Challenge,
  hash: string,
  proof: Proof,
  now: Date,
) {
  if (challenge.status !== "PENDING") throw new WalletError("notFound");
  if (now >= challenge.expiresAt) throw new WalletError("expired");
  if (
    proof.chainId !== challenge.chainId ||
    proof.hash.toLowerCase() !== hash ||
    proof.from.toLowerCase() !== challenge.address ||
    proof.to?.toLowerCase() !== challenge.address ||
    proof.value !== BigInt(challenge.amountWei) ||
    proof.input !== "0x" ||
    proof.status !== "success" ||
    proof.blockNumber <= challenge.startBlock ||
    proof.blockHash !== proof.canonicalBlockHash ||
    proof.transactionBlockHash !== proof.blockHash ||
    proof.timestamp * 1000n < BigInt(challenge.createdAt.getTime()) ||
    proof.timestamp * 1000n >= BigInt(challenge.expiresAt.getTime()) ||
    proof.timestamp * 1000n > BigInt(now.getTime())
  )
    throw new WalletError("incorrectProof");
  const required = chainPolicy[challenge.chainId as ChainId]?.confirmations;
  if (!required) throw new WalletError("incorrectProof");
  if (proof.head - proof.blockNumber + 1n < required)
    throw new WalletError("confirming");
}
