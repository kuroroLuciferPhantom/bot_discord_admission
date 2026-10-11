import { RoleError, uint256 } from "./domain.js";
import type { ChainId } from "../wallets/domain.js";
import { readJson } from "../alchemy/json.js";

export interface HoldingsReader {
  read(
    chainId: ChainId,
    owner: string,
    contract: string,
    signal: AbortSignal,
  ): Promise<Map<string, { balance: bigint; standard: "ERC1155" | "ERC721" }>>;
}
export function createHoldingsReader(
  urls: Partial<Record<ChainId, string>>,
  fetcher: typeof fetch = fetch,
): HoldingsReader {
  return {
    async read(chainId, owner, contract, signal) {
      try {
        const base = urls[chainId];
        if (!base) throw new RoleError("provider");
        const balances = new Map<
          string,
          { balance: bigint; standard: "ERC1155" | "ERC721" }
        >();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        let totalCount: number | undefined;
        for (let page = 0; page < 10; page++) {
          const url = new URL(base.replace(/\/$/, "") + "/getNFTsForOwner");
          url.searchParams.set("owner", owner);
          url.searchParams.append("contractAddresses[]", contract);
          url.searchParams.set("withMetadata", "false");
          url.searchParams.set("pageSize", "100");
          if (cursor) url.searchParams.set("pageKey", cursor);
          const response = await fetcher(url, { signal, redirect: "error" });
          const data = await readJson(response, 2_000_000, signal);
          if (
            !data ||
            typeof data !== "object" ||
            !("ownedNfts" in data) ||
            !Array.isArray(data.ownedNfts) ||
            data.ownedNfts.length > 100
          )
            throw new RoleError("provider");
          if (
            !("totalCount" in data) ||
            typeof data.totalCount !== "number" ||
            !Number.isSafeInteger(data.totalCount) ||
            data.totalCount < 0 ||
            (totalCount !== undefined && data.totalCount !== totalCount)
          )
            throw new RoleError("provider");
          totalCount = data.totalCount;
          for (const nft of data.ownedNfts) {
            if (
              !nft ||
              typeof nft !== "object" ||
              typeof nft.contract?.address !== "string" ||
              nft.contract.address.toLowerCase() !== contract ||
              typeof nft.tokenId !== "string" ||
              typeof nft.balance !== "string"
            )
              throw new RoleError("provider");
            const type = nft.tokenType ?? nft.contract.tokenType;
            if (!["ERC1155", "ERC721"].includes(type))
              throw new RoleError("provider");
            const id = uint256(nft.tokenId),
              balance = BigInt(uint256(nft.balance));
            if (balances.has(id) || (type === "ERC721" && balance !== 1n))
              throw new RoleError("provider");
            balances.set(id, {
              balance,
              standard: type as "ERC1155" | "ERC721",
            });
          }
          const next = "pageKey" in data ? data.pageKey : undefined;
          if (balances.size > totalCount) throw new RoleError("provider");
          if (next === undefined || next === null) {
            if (balances.size !== totalCount) throw new RoleError("provider");
            return balances;
          }
          if (
            typeof next !== "string" ||
            !next ||
            next.length > 2000 ||
            cursors.has(next)
          )
            throw new RoleError("provider");
          cursors.add(next);
          cursor = next;
        }
        throw new RoleError("provider");
      } catch {
        throw new RoleError("provider");
      }
    },
  };
}
