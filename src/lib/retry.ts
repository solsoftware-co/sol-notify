// Only ever called from inside ctx.waitUntil() (the backgrounded half of a
// request), never the synchronous request path — retry backoff would block
// a caller (including client sites calling this service directly over HTTP
// on form submit) for no reason otherwise.

export interface RetryOptions {
  attempts?: number;
  /** Base delay in ms; actual delay is baseDelayMs * 2^attemptIndex. */
  baseDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 250;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}
