import { createHoldingsReader, type HoldingsReader } from "../roles/alchemy.js";
import { createChainReader, type ChainReader } from "../wallets/chain.js";
import { RoleError } from "../roles/domain.js";
import { WalletError } from "../wallets/domain.js";
import { AlchemyError, apiKey, type AlchemyVault } from "./vault.js";
export function endpoints(value: string) {
  const key = apiKey(value);
  return {
    nft: {
      1: `https://eth-mainnet.g.alchemy.com/nft/v3/${key}`,
      137: `https://polygon-mainnet.g.alchemy.com/nft/v3/${key}`,
    },
    rpc: {
      1: `https://eth-mainnet.g.alchemy.com/v2/${key}`,
      137: `https://polygon-mainnet.g.alchemy.com/v2/${key}`,
    },
  };
}
export async function validateKey(
  value: string,
  fetcher: typeof fetch = fetch,
) {
  const urls = endpoints(value),
    signal = AbortSignal.timeout(8000);
  try {
    const checks = await Promise.allSettled(
      ([1, 137] as const).map(async (chain) => {
        const response = await fetcher(urls.rpc[chain], {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_chainId",
            params: [],
          }),
          signal,
          redirect: "error",
        });
        if (!response.ok) throw new Error();
        const text = await response.text();
        if (text.length > 10000) throw new Error();
        const data = JSON.parse(text);
        if (
          !data ||
          data.error ||
          data.result !== (chain === 1 ? "0x1" : "0x89")
        )
          throw new Error();
        const nftUrl = new URL(urls.nft[chain] + "/getNFTsForOwner");
        nftUrl.searchParams.set(
          "owner",
          "0x0000000000000000000000000000000000000000",
        );
        nftUrl.searchParams.set("withMetadata", "false");
        nftUrl.searchParams.set("pageSize", "1");
        const nft = await fetcher(nftUrl, { signal, redirect: "error" });
        if (!nft.ok) throw new Error();
        const body = await nft.text();
        if (body.length > 100000) throw new Error();
        const inventory = JSON.parse(body);
        if (
          !inventory ||
          !Array.isArray(inventory.ownedNfts) ||
          inventory.ownedNfts.length > 1
        )
          throw new Error();
      }),
    );
    if (checks.some((check) => check.status === "rejected")) throw new Error();
  } catch {
    throw new AlchemyError("unavailable");
  }
}
export function guildProviders(
  vault: AlchemyVault,
  fallbackHoldings: HoldingsReader,
  fallbackChain: ChainReader,
) {
  return {
    async holdings(guildId: string) {
      try {
        const key = await vault.get(guildId);
        return key
          ? createHoldingsReader(endpoints(key).nft)
          : fallbackHoldings;
      } catch {
        throw new RoleError("provider");
      }
    },
    async chain(guildId: string) {
      try {
        const key = await vault.get(guildId);
        return key ? createChainReader(endpoints(key).rpc) : fallbackChain;
      } catch {
        throw new WalletError("unavailable");
      }
    },
  };
}
