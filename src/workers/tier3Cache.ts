export interface Tier3Manifest {
  totalBaseWords: number;
  totalTier3DeltaWords: number;
  totalCombinedWords: number;
  lengths: Record<string, number>;
}

const DB_NAME = 'lexicon-path-tier3-db';
const DB_VERSION = 1;
const STORE_NAME = 'shards';

let dbPromise: Promise<IDBDatabase | null> | null = null;
let manifestPromise: Promise<Tier3Manifest | null> | null = null;
const shardMemoryCache = new Map<number, Set<string>>();
const shardInFlight = new Map<number, Promise<Set<string>>>();

function openShardDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null);
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readShardFromDb(key: string): Promise<string | null> {
  const db = await openShardDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () =>
        resolve(typeof req.result === 'string' ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeShardToDb(key: string, value: string): Promise<void> {
  const db = await openShardDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function getLexiconBaseUrl(): string {
  // Worker lives at <base>/assets/wordGraph.worker-xxx.js in production build
  // or <base>/src/workers/wordGraph.worker.ts in Vite dev.
  const href = typeof self !== 'undefined' && self.location ? self.location.href : '';
  if (href.includes('/assets/')) {
    return new URL('../lexicon/', href).href;
  }
  if (href.includes('/src/workers/')) {
    return new URL('../../lexicon/', href).href;
  }
  return new URL('./lexicon/', href || 'http://localhost/').href;
}

export async function getTier3Manifest(): Promise<Tier3Manifest | null> {
  if (manifestPromise) return manifestPromise;

  manifestPromise = (async () => {
    const cacheKey = 'manifest';
    const cached = await readShardFromDb(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as Tier3Manifest;
      } catch {
        // Ignore stale cache
      }
    }

    try {
      const url = getLexiconBaseUrl() + 'manifest.json';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const text = await res.text();
      const parsed = JSON.parse(text) as Tier3Manifest;
      void writeShardToDb(cacheKey, text);
      return parsed;
    } catch {
      return null;
    }
  })();

  return manifestPromise;
}

function parseWordLines(text: string): Set<string> {
  const set = new Set<string>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const w = lines[i].trim();
    if (w.length >= 2) {
      set.add(w);
    }
  }
  return set;
}

export async function loadTier3LengthShard(length: number): Promise<Set<string>> {
  const cached = shardMemoryCache.get(length);
  if (cached) return cached;

  const existing = shardInFlight.get(length);
  if (existing) return existing;

  const promise = (async () => {
    const manifest = await getTier3Manifest();
    if (manifest && !manifest.lengths[String(length)]) {
      const empty = new Set<string>();
      shardMemoryCache.set(length, empty);
      return empty;
    }

    const dbKey = `len-${length}`;
    const stored = await readShardFromDb(dbKey);
    if (stored !== null) {
      const parsed = parseWordLines(stored);
      shardMemoryCache.set(length, parsed);
      return parsed;
    }

    try {
      const url = getLexiconBaseUrl() + `len-${length}.txt`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const empty = new Set<string>();
        shardMemoryCache.set(length, empty);
        return empty;
      }
      const text = await res.text();
      const parsed = parseWordLines(text);
      shardMemoryCache.set(length, parsed);
      void writeShardToDb(dbKey, text);
      return parsed;
    } catch {
      const empty = new Set<string>();
      shardMemoryCache.set(length, empty);
      return empty;
    } finally {
      shardInFlight.delete(length);
    }
  })();

  shardInFlight.set(length, promise);
  return promise;
}

export async function loadTier3LengthRange(
  minLen: number,
  maxLen: number
): Promise<Map<number, Set<string>>> {
  const manifest = await getTier3Manifest();
  const tasks: Array<Promise<[number, Set<string>]>> = [];
  for (let len = minLen; len <= maxLen; len++) {
    if (manifest && !manifest.lengths[String(len)]) continue;
    tasks.push(loadTier3LengthShard(len).then((set) => [len, set]));
  }
  const results = await Promise.all(tasks);
  return new Map(results);
}
