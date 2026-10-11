import { afterEach, describe, expect, it, vi } from "vitest";
import { createChainReader } from "../src/wallets/chain.js";
import type { Hash } from "viem";

afterEach(() => vi.unstubAllGlobals());
const address = "0x1111111111111111111111111111111111111111";
const hash = ("0x" + "a".repeat(64)) as Hash;
const blockHash = "0x" + "b".repeat(64);
function proofRpc(overrides: Record<string, Record<string, unknown>> = {}) {
  const results: Record<string, unknown> = {
    eth_chainId: "0x1",
    eth_blockNumber: "0x80",
    eth_getTransactionByHash: {
      hash,
      from: address,
      to: address,
      value: "0x1",
      input: "0x",
      blockHash,
      blockNumber: "0x65",
      transactionIndex: "0x0",
      type: "0x0",
    },
    eth_getTransactionReceipt: {
      transactionHash: hash,
      from: address,
      to: address,
      blockHash,
      blockNumber: "0x65",
      transactionIndex: "0x0",
      status: "0x1",
      logs: [],
    },
    eth_getBlockByNumber: {
      hash: blockHash,
      number: "0x65",
      timestamp: "0x100",
      transactions: [hash],
    },
  };
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };
    const result = results[request.method];
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result:
          result && typeof result === "object"
            ? { ...result, ...overrides[request.method] }
            : result,
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function mockRpc(chain: string, code = "0x") {
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      id: number;
      method: string;
    };
    const results: Record<string, string> = {
      eth_chainId: chain,
      eth_blockNumber: "0x64",
      eth_getCode: code,
    };
    if (!(request.method in results)) throw new Error("Unexpected method");
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: results[request.method],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("read-only chain transport", () => {
  it("reads a mined proof with consistent transaction, receipt and canonical block", async () => {
    proofRpc();
    const proof = await createChainReader({ 1: "https://rpc.test" }).proof(
      1,
      hash,
    );
    expect(proof).toMatchObject({
      hash,
      blockNumber: 101n,
      blockHash,
      canonicalBlockHash: blockHash,
      status: "success",
    });
  });
  it.each([
    [
      "receipt hash",
      "eth_getTransactionReceipt",
      { transactionHash: "0x" + "c".repeat(64) },
    ],
    ["receipt block", "eth_getTransactionReceipt", { blockNumber: "0x66" }],
    [
      "receipt block hash",
      "eth_getTransactionReceipt",
      { blockHash: "0x" + "c".repeat(64) },
    ],
    [
      "transaction hash",
      "eth_getTransactionByHash",
      { hash: "0x" + "c".repeat(64) },
    ],
    [
      "pending transaction",
      "eth_getTransactionByHash",
      { blockNumber: null, blockHash: null },
    ],
    ["canonical block number", "eth_getBlockByNumber", { number: "0x66" }],
  ] as const)(
    "rejects inconsistent RPC %s",
    async (_label, method, override) => {
      proofRpc({ [method]: override });
      await expect(
        createChainReader({ 1: "https://rpc.test" }).proof(1, hash),
      ).rejects.toThrow("unavailable");
    },
  );
  it("reads chain, block and code at the same snapshot block", async () => {
    const fetcher = mockRpc("0x1");
    const result = await createChainReader({ 1: "https://rpc.test" }).snapshot(
      1,
      address,
    );
    expect(result).toEqual({ chainId: 1, blockNumber: 100n, code: "0x" });
    const requests = fetcher.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(requests.map((request) => request.method)).toEqual([
      "eth_chainId",
      "eth_blockNumber",
      "eth_getCode",
    ]);
    expect(requests[2].params).toEqual([address, "0x64"]);
  });
  it("rejects RPC endpoints for a different chain", async () => {
    mockRpc("0x89");
    await expect(
      createChainReader({ 1: "https://rpc.test" }).snapshot(1, address),
    ).rejects.toThrow("unavailable");
  });
  it("rejects missing endpoint configuration without contacting a provider", async () => {
    const fetcher = mockRpc("0x1");
    await expect(createChainReader({}).snapshot(1, address)).rejects.toThrow(
      "unavailable",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sanitizes provider failures without leaking URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("https://rpc.test/secret-key")),
    );
    await expect(
      createChainReader({ 1: "https://rpc.test/secret-key" }).snapshot(
        1,
        address,
      ),
    ).rejects.toThrow("unavailable");
  });
});
