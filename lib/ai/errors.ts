export class AiRateLimitError extends Error {
  constructor(message = 'AI provider rate limit reached', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiRateLimitError';
  }
}
export class AiBadOutputError extends Error {
  constructor(message = 'AI provider returned unusable output', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiBadOutputError';
  }
}
export class AiTimeoutError extends Error {
  constructor(message = 'AI call timed out', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiTimeoutError';
  }
}

/** Map an SDK failure to a typed error; unknown errors pass through unchanged. */
export function mapSdkError(err: unknown): unknown {
  if (err instanceof AiRateLimitError || err instanceof AiBadOutputError || err instanceof AiTimeoutError) return err;
  const e = err as { status?: unknown; code?: unknown; message?: unknown } | null;
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (e?.status === 429 || e?.code === 429 || e?.status === 'RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED/.test(msg)) {
    return new AiRateLimitError(undefined, { cause: err });
  }
  return err;
}
