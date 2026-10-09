import { afterEach, describe, expect, it, vi } from "vitest";
import { createChainReader } from "../src/wallets/chain.js";

afterEach(() => vi.unstubAllGlobals());
const address = "0x1111111111111111111111111111111111111111";
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
