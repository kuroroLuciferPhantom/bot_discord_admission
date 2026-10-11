import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { readJson } from "../alchemy/json.js";
import { normalizeAddress, type ChainId } from "../wallets/domain.js";
import { RoleError, tokenDecimals } from "./domain.js";

export interface TokenReader {
  decimals(
    chainId: ChainId,
    contract: string,
    signal: AbortSignal,
  ): Promise<number>;
  read(
    chainId: ChainId,
    contract: string,
    owners: string[],
    decimals: number,
    signal: AbortSignal,
  ): Promise<bigint>;
}

export function createTokenReader(
  urls: Partial<Record<ChainId, string>>,
  fetcher: typeof fetch = fetch,
): TokenReader {
  const rpc = async (
    chainId: ChainId,
    method: string,
    params: unknown[],
    signal: AbortSignal,
  ): Promise<unknown> => {
    const url = urls[chainId];
    if (!url) throw new RoleError("provider");
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: requestSignal,
      redirect: "error",
    });
    const data = await readJson(
      response,
      ["eth_getCode", "eth_getBlockByNumber"].includes(method)
        ? 2_000_000
        : 10000,
      requestSignal,
    );
    if (
      !data ||
      typeof data !== "object" ||
      "error" in data ||
      !("jsonrpc" in data) ||
      data.jsonrpc !== "2.0" ||
      !("id" in data) ||
      data.id !== 1 ||
      !("result" in data)
    )
      throw new RoleError("provider");
    return data.result;
  };
  const quantity = (value: unknown): bigint => {
    if (
      typeof value !== "string" ||
      !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value)
    )
      throw new RoleError("provider");
    return BigInt(value);
  };
  const snapshot = async (
    chainId: ChainId,
    contract: string,
    signal: AbortSignal,
  ) => {
    if (
      quantity(await rpc(chainId, "eth_chainId", [], signal)) !==
      BigInt(chainId)
    )
      throw new RoleError("provider");
    const block = await rpc(chainId, "eth_blockNumber", [], signal);
    quantity(block);
    const header = await rpc(
      chainId,
      "eth_getBlockByNumber",
      [block, false],
      signal,
    );
    if (
      !header ||
      typeof header !== "object" ||
      !("hash" in header) ||
      typeof header.hash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(header.hash) ||
      !("number" in header) ||
      header.number !== block
    )
      throw new RoleError("provider");
    // EIP-1898 pins every state read to this canonical hash, even across a reorg.
    const snapshot = { blockHash: header.hash, requireCanonical: true };
    const code = await rpc(
      chainId,
      "eth_getCode",
      [contract, snapshot],
      signal,
    );
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code))
      throw new RoleError("provider");
    return snapshot;
  };
  type Block = { blockHash: string; requireCanonical: boolean };
  const call = async (
    chainId: ChainId,
    contract: string,
    data: Hex,
    block: Block,
    signal: AbortSignal,
  ) => {
    const result = await rpc(
      chainId,
      "eth_call",
      [{ to: contract, data }, block],
      signal,
    );
    // ABI uint256/uint8 returns exactly one 32-byte word; empty/truncated data is not zero.
    if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result))
      throw new RoleError("provider");
    return BigInt(result);
  };
  const decimalsAt = async (
    chainId: ChainId,
    contract: string,
    block: Block,
    signal: AbortSignal,
  ) => {
    const value = await call(
      chainId,
      contract,
      encodeFunctionData({ abi: erc20Abi, functionName: "decimals" }),
      block,
      signal,
    );
    if (value > 255n) throw new RoleError("provider");
    return Number(value);
  };
  return {
    async decimals(chainId, contractInput, signal) {
      try {
        const contract = normalizeAddress(contractInput);
        const block = await snapshot(chainId, contract, signal);
        return await decimalsAt(chainId, contract, block, signal);
      } catch {
        throw new RoleError("provider");
      }
    },
    async read(chainId, contractInput, owners, expectedDecimals, signal) {
      try {
        tokenDecimals(expectedDecimals);
        const contract = normalizeAddress(contractInput);
        const addresses = [...new Set(owners.map(normalizeAddress))];
        if (addresses.length > 5) throw new RoleError("provider");
        if (!addresses.length) return 0n;
        const block = await snapshot(chainId, contract, signal);
        if (
          (await decimalsAt(chainId, contract, block, signal)) !==
          expectedDecimals
        )
          throw new RoleError("provider");
        const balances = await Promise.allSettled(
          addresses.map((address) =>
            call(
              chainId,
              contract,
              encodeFunctionData({
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [address as `0x${string}`],
              }),
              block,
              signal,
            ),
          ),
        );
        let total = 0n;
        for (const balance of balances) {
          if (balance.status === "rejected") throw new RoleError("provider");
          total += balance.value;
        }
        return total;
      } catch {
        throw new RoleError("provider");
      }
    },
  };
}
