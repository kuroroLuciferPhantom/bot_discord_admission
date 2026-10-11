import { describe, expect, it, vi } from "vitest";
import { readJson } from "../src/alchemy/json.js";

describe("bounded provider JSON", () => {
  it("decodes UTF-8 split across chunks and accepts the exact byte limit", async () => {
    const bytes = new TextEncoder().encode('{"value":"é"}');
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      }),
    );
    await expect(
      readJson(response, bytes.length, AbortSignal.timeout(1000)),
    ).resolves.toEqual({ value: "é" });
  });
  it("counts bytes rather than JavaScript string characters", async () => {
    const text = '{"value":"é"}';
    await expect(
      readJson(new Response(text), text.length, AbortSignal.timeout(1000)),
    ).rejects.toThrow("Invalid provider response");
  });
  it("cancels an advertised oversized body without downloading it", async () => {
    const pull = vi.fn(),
      cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
      {
        headers: { "content-length": "1001" },
      },
    );
    await expect(
      readJson(response, 1000, AbortSignal.timeout(1000)),
    ).rejects.toThrow("Invalid provider response");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });
  it("does not trust an understated content length", async () => {
    await expect(
      readJson(
        new Response('{"value":1}', { headers: { "content-length": "1" } }),
        5,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("Invalid provider response");
  });
  it("cancels a stalled body when the caller's deadline expires", async () => {
    const abort = new AbortController(),
      cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const pending = readJson(response, 1000, abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow("Invalid provider response");
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });
  it("rejects HTTP errors without consuming their secret-bearing body", async () => {
    const pull = vi.fn(),
      cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
      { status: 403 },
    );
    await expect(
      readJson(response, 1000, AbortSignal.timeout(1000)),
    ).rejects.toThrow("Invalid provider response");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects missing bodies and sanitizes malformed JSON", async () => {
    await expect(
      readJson(new Response(null), 1000, AbortSignal.timeout(1000)),
    ).rejects.toThrow("Invalid provider response");
    await expect(
      readJson(
        new Response("private-provider-payload"),
        1000,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow(/^Invalid provider response$/);
  });
});
