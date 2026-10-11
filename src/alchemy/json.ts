// Enforce the limit while downloading, including chunked and decompressed bodies.
export async function readJson(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Invalid provider response");
  }
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  let complete = false;
  try {
    signal.throwIfAborted();
    const length = response.headers.get("content-length");
    if (length && /^\d+$/.test(length) && BigInt(length) > BigInt(maxBytes))
      throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        complete = true;
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) throw new Error();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new Error("Invalid provider response");
  } finally {
    signal.removeEventListener("abort", abort);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
