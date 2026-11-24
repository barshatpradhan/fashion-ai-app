import { adminClient } from '@/lib/db/admin';
import { AiTimeoutError } from '@/lib/ai/errors';

/** Demo cache of JSON-serialisable results. Binary image caching is the routes' job. */
export interface DemoCacheStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
}

const dbStore: DemoCacheStore = {
  async get(key) {
    const { data, error } = await adminClient().from('demo_cache').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  },
  async set(key, value) {
    const { error } = await adminClient().from('demo_cache').upsert({ key, value });
    if (error) throw error;
  },
};

let store: DemoCacheStore | null = null;
/** Test seam: inject a store, or pass null to restore the DB-backed default. */
export function setDemoCacheStore(s: DemoCacheStore | null): void {
  store = s;
}
const cache = () => store ?? dbStore;

export async function withGuard<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { timeoutMs: number; demo: boolean },
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiTimeoutError()), opts.timeoutMs);
  });
  try {
    const result = await Promise.race([fn(), timeout]);
    if (opts.demo) {
      try {
        await cache().set(key, result);
      } catch {
        // A cache write failure must not fail a successful call.
      }
    }
    return result;
  } catch (err) {
    if (opts.demo) {
      let cached: unknown | null = null;
      try {
        cached = await cache().get(key);
      } catch {
        // fall through to the original error
      }
      if (cached !== null && cached !== undefined) return cached as T;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
