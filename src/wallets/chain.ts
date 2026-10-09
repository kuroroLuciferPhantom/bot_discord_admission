import { createPublicClient, http, type Address, type Hash } from "viem";
import { mainnet, polygon } from "viem/chains";
import {
  WalletError,
  type ChainId,
  type ChainSnapshot,
  type Proof,
} from "./domain.js";

export interface ChainReader {
  snapshot(chainId: ChainId, address: string): Promise<ChainSnapshot>;
  proof(chainId: ChainId, hash: Hash): Promise<Proof>;
}
export function createChainReader(
  urls: Partial<Record<ChainId, string>>,
): ChainReader {
  const clientFor = (chainId: ChainId) => {
    const url = urls[chainId];
    if (!url) throw new WalletError("unavailable");
    return createPublicClient({
      chain: chainId === 1 ? mainnet : polygon,
      transport: http(url, { timeout: 8_000, retryCount: 0 }),
    });
  };
  return {
    async snapshot(chainId, address) {
      try {
        const client = clientFor(chainId);
        const actualChain = await client.getChainId();
        const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
        const code = await client.getCode({
          address: address as Address,
          blockNumber,
        });
        if (actualChain !== chainId) throw new WalletError("unavailable");
        return { chainId, blockNumber, code: code ?? "0x" };
      } catch (error) {
        if (error instanceof WalletError) throw error;
        throw new WalletError("unavailable");
      }
    },
    async proof(chainId, hash) {
      try {
        const client = clientFor(chainId);
        const [actualChain, transaction, receipt, head] = await Promise.all([
          client.getChainId(),
          client.getTransaction({ hash }),
          client.getTransactionReceipt({ hash }),
          client.getBlockNumber({ cacheTime: 0 }),
        ]);
        const block = await client.getBlock({
          blockNumber: receipt.blockNumber,
        });
        if (!block.hash || actualChain !== chainId)
          throw new WalletError("unavailable");
        return {
          chainId: actualChain,
          hash: transaction.hash,
          from: transaction.from,
          to: transaction.to,
          value: transaction.value,
          input: transaction.input,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          transactionBlockHash: transaction.blockHash,
          canonicalBlockHash: block.hash,
          timestamp: block.timestamp,
          head,
        };
      } catch (error) {
        if (error instanceof WalletError) throw error;
        // Missing/pending receipts and RPC errors never link a wallet.
        throw new WalletError("unavailable");
      }
    },
  };
}
