// Only ever called from inside ctx.waitUntil() (the backgrounded half of a
// request), never the synchronous request path — retry backoff would block
// a caller (including client sites calling this service directly over HTTP
// on form submit) for no reason otherwise.

export interface RetryOptions {
  attempts?: number;
  /** Base delay in ms; actual delay is baseDelayMs * 2^attemptIndex. */
  baseDelayMs?: number;
}

// Thrown for failures a retry can't fix (e.g. a rejected credential, a
// malformed request) — withRetry rethrows it immediately. Retrying those
// only hammers the provider: repeated bad-credential attempts got the
// Mailtrap token locked out ("Too many failed login attempts").
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

// 4xx means the request itself is wrong, except 429 (rate limited), which is
// worth backing off and retrying.
export function isRetryableStatus(status: number | null | undefined): boolean {
  return status == null || status === 429 || status >= 500;
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
      if (err instanceof NonRetryableError) throw err;
      lastError = err;
      if (attempt < attempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}
