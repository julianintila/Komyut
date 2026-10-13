import { RailRefreshError } from './railSnapshot';

export type RailFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function fetchRailBytes(url: string, limit: number, fetcher: RailFetch, timeoutMs = 10_000): Promise<Uint8Array> {
  if (!url.startsWith('https://trainsph-data.web.app/') || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new RailRefreshError('invalid_data');
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      void reader?.cancel().catch(() => {});
      reject(new RailRefreshError('timeout'));
    }, timeoutMs);
  });
  const operation = async (): Promise<Uint8Array> => {
    const response = await fetcher(url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (timedOut) throw new RailRefreshError('timeout');
    if (!response.ok || response.redirected || !response.body) throw new RailRefreshError('network');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RailRefreshError('size_limit');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (timedOut) throw new RailRefreshError('timeout');
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new RailRefreshError('size_limit');
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  };
  try { return await Promise.race([operation(), deadline]); }
  catch (error: unknown) {
    controller.abort();
    void reader?.cancel().catch(() => {});
    if (timedOut) throw new RailRefreshError('timeout');
    if (error instanceof RailRefreshError) throw error;
    throw new RailRefreshError('network');
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
