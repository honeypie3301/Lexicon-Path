import type {
  AlgorithmId,
  LexiconMode,
  SearchResult,
  WorkerRequest,
  WorkerResponse,
} from '../types/wordGraph';

class GraphWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pendingSearch = new Map<
    number,
    {
      resolve: (res: SearchResult) => void;
      reject: (err: Error) => void;
    }
  >();
  private pendingRandom = new Map<
    number,
    {
      resolve: (pair: { startWord: string; targetWord: string }) => void;
      reject: (err: Error) => void;
    }
  >();
  private readyPromise: Promise<void> | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('../workers/wordGraph.worker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        const searchEntry = this.pendingSearch.get(msg.id);
        if (searchEntry) {
          this.pendingSearch.delete(msg.id);
          if (msg.type === 'error') {
            searchEntry.reject(new Error(msg.error || 'Graph search failed'));
          } else if (msg.result) {
            searchEntry.resolve(msg.result);
          }
          return;
        }

        const randomEntry = this.pendingRandom.get(msg.id);
        if (randomEntry) {
          this.pendingRandom.delete(msg.id);
          if (msg.type === 'error') {
            randomEntry.reject(new Error(msg.error || 'Random pair failed'));
          } else if (msg.pair) {
            randomEntry.resolve(msg.pair);
          }
        }
      };
      this.worker.onerror = (err) => {
        for (const entry of this.pendingSearch.values()) {
          entry.reject(new Error(err.message || 'Worker execution error'));
        }
        this.pendingSearch.clear();
        for (const entry of this.pendingRandom.values()) {
          entry.reject(new Error(err.message || 'Worker execution error'));
        }
        this.pendingRandom.clear();
      };
    }
    return this.worker;
  }

  warmup(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    const worker = this.ensureWorker();
    const id = this.nextId++;
    this.readyPromise = new Promise<void>((resolve) => {
      const handler = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id === id && event.data.type === 'ready') {
          worker.removeEventListener('message', handler);
          resolve();
        }
      };
      worker.addEventListener('message', handler);
      const req: WorkerRequest = { id, type: 'warmup' };
      worker.postMessage(req);
    });
    return this.readyPromise;
  }

  search(params: {
    startWord: string;
    targetWord: string;
    algorithm: AlgorithmId;
    lexiconMode: LexiconMode;
    allowInsertDelete: boolean;
    strictDictionaryOnly: boolean;
  }): Promise<SearchResult> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<SearchResult>((resolve, reject) => {
      this.pendingSearch.set(id, { resolve, reject });
      const req: WorkerRequest = {
        id,
        type: 'search',
        payload: params,
      };
      worker.postMessage(req);
    });
  }

  getRandomPair(params: {
    lexiconMode: LexiconMode;
    allowInsertDelete: boolean;
    excludeStart?: string;
    excludeTarget?: string;
  }): Promise<{ startWord: string; targetWord: string }> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<{ startWord: string; targetWord: string }>((resolve, reject) => {
      this.pendingRandom.set(id, { resolve, reject });
      const req: WorkerRequest = {
        id,
        type: 'random-pair',
        randomPayload: params,
      };
      worker.postMessage(req);
    });
  }
}

export const graphClient = new GraphWorkerClient();
