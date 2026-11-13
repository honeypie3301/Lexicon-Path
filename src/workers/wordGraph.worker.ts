import englishWords from 'an-array-of-english-words';
import { words as popularWords } from 'popular-english-words';
import type {
  AlgorithmBenchmark,
  AlgorithmId,
  FrontierLayer,
  LexiconMode,
  SearchResult,
  TransitionStep,
  WordCheckInfo,
  WorkerRequest,
  WorkerResponse,
} from '../types/wordGraph';
import {
  computeEditDistance,
  computeHammingDistance,
  computeSingleEditPath,
  validateTransformationChain,
} from '../utils/pathValidator';

const ALPHA_RE = /^[a-z]+$/;
const PATTERN_CACHE_WORD_LIMIT = 16000;
const MAX_WORD_LENGTH = 64;
const EDIT_BRIDGE_NODE_CAP = 12000;
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

interface LengthIndex {
  wordSet: Set<string>;
  patternMap: Map<string, string[]> | null;
}

const rankMap = new Map<string, number>();
let extendedAllWords: Set<string> | null = null;
let commonAllWords: Set<string> | null = null;
let extendedByLength: Map<number, Set<string>> | null = null;
let commonByLength: Map<number, Set<string>> | null = null;
const lengthIndexCache = new Map<string, LengthIndex>();
let bigramLogScores: Map<string, number> | null = null;

function ensureDictionariesInitialized(): void {
  if (extendedByLength && commonByLength && extendedAllWords && commonAllWords) return;

  const topPopular = popularWords.getMostPopular(32000);
  for (let i = 0; i < topPopular.length; i++) {
    const lower = topPopular[i].toLowerCase();
    if (!rankMap.has(lower) && ALPHA_RE.test(lower)) {
      rankMap.set(lower, i);
    }
  }

  const broaderPopular = popularWords.getMostPopular(60000);
  for (let i = topPopular.length; i < broaderPopular.length; i++) {
    const lower = broaderPopular[i].toLowerCase();
    if (!rankMap.has(lower) && ALPHA_RE.test(lower)) {
      rankMap.set(lower, i);
    }
  }

  const extAll = new Set<string>();
  const comAll = new Set<string>();
  const extMap = new Map<number, Set<string>>();
  const comMap = new Map<number, Set<string>>();
  const commonCutoff = topPopular.length;

  for (let i = 0; i < englishWords.length; i++) {
    const w = englishWords[i];
    if (!ALPHA_RE.test(w)) continue;
    const len = w.length;
    if (len < 2 || len > MAX_WORD_LENGTH) continue;

    extAll.add(w);
    let extSet = extMap.get(len);
    if (!extSet) {
      extSet = new Set<string>();
      extMap.set(len, extSet);
    }
    extSet.add(w);

    const rank = rankMap.get(w);
    if (rank !== undefined && rank < commonCutoff) {
      comAll.add(w);
      let comSet = comMap.get(len);
      if (!comSet) {
        comSet = new Set<string>();
        comMap.set(len, comSet);
      }
      comSet.add(w);
    }
  }

  extendedAllWords = extAll;
  commonAllWords = comAll;
  extendedByLength = extMap;
  commonByLength = comMap;
}

function ensureBigramModelInitialized(): Map<string, number> {
  if (bigramLogScores) return bigramLogScores;
  ensureDictionariesInitialized();

  const counts = new Map<string, number>();
  for (const w of commonAllWords!) {
    const padded = '^' + w + '$';
    for (let i = 0; i < padded.length - 1; i++) {
      const bg = padded.slice(i, i + 2);
      counts.set(bg, (counts.get(bg) ?? 0) + 1);
    }
  }

  const scores = new Map<string, number>();
  for (const [bg, count] of counts.entries()) {
    scores.set(bg, Math.log(count + 1));
  }
  bigramLogScores = scores;
  return scores;
}

function scoreLinguisticNaturalness(word: string, focusIndex: number): number {
  const scores = ensureBigramModelInitialized();
  const dict = extendedAllWords!;
  let total = 0;

  // Bigram log-likelihood across the whole word
  const padded = '^' + word + '$';
  for (let i = 0; i < padded.length - 1; i++) {
    total += scores.get(padded.slice(i, i + 2)) ?? -2.5;
  }

  // Phonotactic penalty for unnatural consonant/vowel runs (3+ in a row)
  let consRun = 0;
  let vowRun = 0;
  for (let i = 0; i < word.length; i++) {
    if (VOWELS.has(word[i])) {
      vowRun++;
      consRun = 0;
    } else {
      consRun++;
      vowRun = 0;
    }
    if (consRun >= 3) total -= 3.5;
    if (vowRun >= 3) total -= 2.5;
  }

  // Real English word or local English morpheme/subword bonus around focusIndex
  if (dict.has(word)) {
    total += 60;
  } else {
    const startMin = Math.max(0, focusIndex - 5);
    const endMax = Math.min(word.length, focusIndex + 6);
    for (let len = 6; len >= 4; len--) {
      for (let s = startMin; s + len <= endMax; s++) {
        if (s <= focusIndex && focusIndex < s + len) {
          if (dict.has(word.slice(s, s + len))) {
            total += len * 1.5;
          }
        }
      }
    }
  }

  return total;
}

function getWordRank(w: string): number {
  return rankMap.get(w) ?? 999999;
}

function getLengthIndex(mode: LexiconMode, length: number): LengthIndex {
  ensureDictionariesInitialized();
  const baseMap = mode === 'common' ? commonByLength! : extendedByLength!;
  const wordSet = baseMap.get(length) ?? new Set<string>();
  const cacheKey = `${mode}:${length}`;

  if (lengthIndexCache.has(cacheKey)) {
    return lengthIndexCache.get(cacheKey)!;
  }

  let patternMap: Map<string, string[]> | null = null;
  if (wordSet.size > 0 && wordSet.size <= PATTERN_CACHE_WORD_LIMIT) {
    patternMap = new Map<string, string[]>();
    for (const word of wordSet) {
      for (let i = 0; i < length; i++) {
        const pattern = word.slice(0, i) + '*' + word.slice(i + 1);
        let bucket = patternMap.get(pattern);
        if (!bucket) {
          bucket = [];
          patternMap.set(pattern, bucket);
        }
        bucket.push(word);
      }
    }

    for (const bucket of patternMap.values()) {
      if (bucket.length > 1) {
        bucket.sort((a, b) => getWordRank(a) - getWordRank(b));
      }
    }
  }

  const index: LengthIndex = { wordSet, patternMap };
  lengthIndexCache.set(cacheKey, index);
  return index;
}

interface SearchContext {
  wordSet: Set<string>;
  patternMap: Map<string, string[]> | null;
  allowInsertDelete: boolean;
}

function getNeighbors(
  word: string,
  ctx: SearchContext,
  stats?: { candidatesChecked: number }
): string[] {
  const neighbors: string[] = [];

  if (!ctx.allowInsertDelete && ctx.patternMap) {
    for (let i = 0; i < word.length; i++) {
      const pattern = word.slice(0, i) + '*' + word.slice(i + 1);
      const bucket = ctx.patternMap.get(pattern);
      if (!bucket) continue;
      for (let j = 0; j < bucket.length; j++) {
        if (stats) stats.candidatesChecked++;
        const candidate = bucket[j];
        if (candidate !== word) {
          neighbors.push(candidate);
        }
      }
    }
    return neighbors;
  }

  for (let i = 0; i < word.length; i++) {
    const orig = word.charCodeAt(i);
    const prefix = word.slice(0, i);
    const suffix = word.slice(i + 1);
    for (let c = 97; c <= 122; c++) {
      if (c === orig) continue;
      if (stats) stats.candidatesChecked++;
      const candidate = prefix + String.fromCharCode(c) + suffix;
      if (ctx.wordSet.has(candidate)) {
        neighbors.push(candidate);
      }
    }
  }

  if (ctx.allowInsertDelete) {
    const seen = new Set<string>(neighbors);

    if (word.length > 2) {
      for (let i = 0; i < word.length; i++) {
        if (stats) stats.candidatesChecked++;
        const candidate = word.slice(0, i) + word.slice(i + 1);
        if (ctx.wordSet.has(candidate) && !seen.has(candidate)) {
          seen.add(candidate);
          neighbors.push(candidate);
        }
      }
    }

    if (word.length < MAX_WORD_LENGTH) {
      for (let i = 0; i <= word.length; i++) {
        const prefix = word.slice(0, i);
        const suffix = word.slice(i);
        for (let c = 97; c <= 122; c++) {
          if (stats) stats.candidatesChecked++;
          const candidate = prefix + String.fromCharCode(c) + suffix;
          if (ctx.wordSet.has(candidate) && !seen.has(candidate)) {
            seen.add(candidate);
            neighbors.push(candidate);
          }
        }
      }
    }
  }

  if (neighbors.length > 1) {
    neighbors.sort((a, b) => getWordRank(a) - getWordRank(b));
  }
  return neighbors;
}

function measureComponentSize(
  seed: string,
  ctx: SearchContext,
  limit = 300
): number {
  if (!ctx.wordSet.has(seed)) return 0;
  const visited = new Set<string>([seed]);
  const queue: string[] = [seed];
  let head = 0;
  while (head < queue.length && visited.size < limit) {
    const cur = queue[head++];
    const nbrs = getNeighbors(cur, ctx);
    for (let i = 0; i < nbrs.length; i++) {
      const n = nbrs[i];
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
        if (visited.size >= limit) break;
      }
    }
  }
  return visited.size;
}

function reconstructFromParents(
  meeting: string,
  fwdParent: Map<string, string | null>,
  bwdParent: Map<string, string | null>
): string[] {
  const left: string[] = [];
  let cur: string | null = meeting;
  while (cur !== null) {
    left.push(cur);
    cur = fwdParent.get(cur) ?? null;
  }
  left.reverse();

  const right: string[] = [];
  cur = bwdParent.get(meeting) ?? null;
  while (cur !== null) {
    right.push(cur);
    cur = bwdParent.get(cur) ?? null;
  }

  return [...left, ...right];
}

function reconstructSingleSide(
  end: string,
  parent: Map<string, string | null>
): string[] {
  const path: string[] = [];
  let cur: string | null = end;
  while (cur !== null) {
    path.push(cur);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return path;
}

interface InternalRunResult {
  path: string[] | null;
  nodesVisited: number;
  candidatesChecked: number;
  frontierPeak: number;
  durationMs: number;
  meetingWord: string | null;
  meetingDepthForward: number;
  meetingDepthBackward: number;
  layers: FrontierLayer[];
}

function runBidirectionalBfs(
  start: string,
  target: string,
  ctx: SearchContext,
  recordLayers: boolean,
  nodeCap = Infinity
): InternalRunResult {
  const t0 = performance.now();
  const stats = { candidatesChecked: 0 };

  if (start === target) {
    return {
      path: [start],
      nodesVisited: 1,
      candidatesChecked: 0,
      frontierPeak: 1,
      durationMs: performance.now() - t0,
      meetingWord: start,
      meetingDepthForward: 0,
      meetingDepthBackward: 0,
      layers: recordLayers
        ? [{ side: 'forward', depth: 0, nodeCount: 1, sampleNodes: [start], pathNode: start }]
        : [],
    };
  }

  let fwdQueue: string[] = [start];
  let bwdQueue: string[] = [target];
  const fwdParent = new Map<string, string | null>([[start, null]]);
  const bwdParent = new Map<string, string | null>([[target, null]]);
  const fwdDepth = new Map<string, number>([[start, 0]]);
  const bwdDepth = new Map<string, number>([[target, 0]]);

  let nodesVisited = 2;
  let frontierPeak = 2;
  const rawLayers: FrontierLayer[] = recordLayers
    ? [
        { side: 'forward', depth: 0, nodeCount: 1, sampleNodes: [start] },
        { side: 'backward', depth: 0, nodeCount: 1, sampleNodes: [target] },
      ]
    : [];

  let depthF = 0;
  let depthB = 0;

  while (fwdQueue.length > 0 && bwdQueue.length > 0 && nodesVisited < nodeCap) {
    const expandFwd = fwdQueue.length <= bwdQueue.length;
    const currentQueue = expandFwd ? fwdQueue : bwdQueue;
    const ownParent = expandFwd ? fwdParent : bwdParent;
    const otherParent = expandFwd ? bwdParent : fwdParent;
    const ownDepthMap = expandFwd ? fwdDepth : bwdDepth;

    if (expandFwd) depthF++;
    else depthB++;
    const nextDepth = expandFwd ? depthF : depthB;

    const nextQueue: string[] = [];

    for (let q = 0; q < currentQueue.length; q++) {
      const word = currentQueue[q];
      const neighbors = getNeighbors(word, ctx, stats);

      for (let b = 0; b < neighbors.length; b++) {
        const neighbor = neighbors[b];

        if (otherParent.has(neighbor)) {
          if (!ownParent.has(neighbor)) {
            ownParent.set(neighbor, word);
            ownDepthMap.set(neighbor, nextDepth);
            nodesVisited++;
          }
          const path = reconstructFromParents(neighbor, fwdParent, bwdParent);
          const pathSet = new Set(path);
          if (recordLayers) {
            rawLayers.push({
              side: expandFwd ? 'forward' : 'backward',
              depth: nextDepth,
              nodeCount: nextQueue.length + 1,
              sampleNodes: [...nextQueue.slice(0, 5), neighbor].slice(0, 6),
            });
            for (const layer of rawLayers) {
              const match = layer.sampleNodes.find((n) => pathSet.has(n));
              if (match) layer.pathNode = match;
            }
          }
          return {
            path,
            nodesVisited,
            candidatesChecked: stats.candidatesChecked,
            frontierPeak,
            durationMs: performance.now() - t0,
            meetingWord: neighbor,
            meetingDepthForward: fwdDepth.get(neighbor) ?? depthF,
            meetingDepthBackward: bwdDepth.get(neighbor) ?? depthB,
            layers: rawLayers,
          };
        }

        if (!ownParent.has(neighbor)) {
          ownParent.set(neighbor, word);
          ownDepthMap.set(neighbor, nextDepth);
          nextQueue.push(neighbor);
          nodesVisited++;
          if (nodesVisited >= nodeCap) break;
        }
      }
      if (nodesVisited >= nodeCap) break;
    }

    const combinedFrontier =
      nextQueue.length + (expandFwd ? bwdQueue.length : fwdQueue.length);
    if (combinedFrontier > frontierPeak) {
      frontierPeak = combinedFrontier;
    }

    if (recordLayers && nextQueue.length > 0) {
      rawLayers.push({
        side: expandFwd ? 'forward' : 'backward',
        depth: nextDepth,
        nodeCount: nextQueue.length,
        sampleNodes: nextQueue.slice(0, 6),
      });
    }

    if (expandFwd) fwdQueue = nextQueue;
    else bwdQueue = nextQueue;
  }

  return {
    path: null,
    nodesVisited,
    candidatesChecked: stats.candidatesChecked,
    frontierPeak,
    durationMs: performance.now() - t0,
    meetingWord: null,
    meetingDepthForward: 0,
    meetingDepthBackward: 0,
    layers: rawLayers,
  };
}

function runStandardBfs(
  start: string,
  target: string,
  ctx: SearchContext,
  recordLayers: boolean,
  nodeCap = Infinity
): InternalRunResult {
  const t0 = performance.now();
  const stats = { candidatesChecked: 0 };

  if (start === target) {
    return {
      path: [start],
      nodesVisited: 1,
      candidatesChecked: 0,
      frontierPeak: 1,
      durationMs: performance.now() - t0,
      meetingWord: start,
      meetingDepthForward: 0,
      meetingDepthBackward: 0,
      layers: recordLayers
        ? [{ side: 'forward', depth: 0, nodeCount: 1, sampleNodes: [start], pathNode: start }]
        : [],
    };
  }

  let queue: string[] = [start];
  const parent = new Map<string, string | null>([[start, null]]);
  let nodesVisited = 1;
  let frontierPeak = 1;
  let depth = 0;
  const rawLayers: FrontierLayer[] = recordLayers
    ? [{ side: 'forward', depth: 0, nodeCount: 1, sampleNodes: [start] }]
    : [];

  while (queue.length > 0 && nodesVisited < nodeCap) {
    depth++;
    const nextQueue: string[] = [];

    for (let q = 0; q < queue.length; q++) {
      const word = queue[q];
      const neighbors = getNeighbors(word, ctx, stats);

      for (let b = 0; b < neighbors.length; b++) {
        const neighbor = neighbors[b];
        if (parent.has(neighbor)) continue;
        parent.set(neighbor, word);
        nodesVisited++;

        if (neighbor === target) {
          const path = reconstructSingleSide(target, parent);
          if (recordLayers) {
            rawLayers.push({
              side: 'forward',
              depth,
              nodeCount: nextQueue.length + 1,
              sampleNodes: [...nextQueue.slice(0, 5), target].slice(0, 6),
            });
          }
          return {
            path,
            nodesVisited,
            candidatesChecked: stats.candidatesChecked,
            frontierPeak,
            durationMs: performance.now() - t0,
            meetingWord: null,
            meetingDepthForward: depth,
            meetingDepthBackward: 0,
            layers: rawLayers,
          };
        }

        nextQueue.push(neighbor);
        if (nodesVisited >= nodeCap) break;
      }
      if (nodesVisited >= nodeCap) break;
    }

    if (nextQueue.length > frontierPeak) {
      frontierPeak = nextQueue.length;
    }

    if (recordLayers && nextQueue.length > 0) {
      rawLayers.push({
        side: 'forward',
        depth,
        nodeCount: nextQueue.length,
        sampleNodes: nextQueue.slice(0, 6),
      });
    }

    queue = nextQueue;
  }

  return {
    path: null,
    nodesVisited,
    candidatesChecked: stats.candidatesChecked,
    frontierPeak,
    durationMs: performance.now() - t0,
    meetingWord: null,
    meetingDepthForward: 0,
    meetingDepthBackward: 0,
    layers: rawLayers,
  };
}

interface HeapNode {
  word: string;
  g: number;
  h: number;
  f: number;
  rank: number;
}

class MinHeap {
  private data: HeapNode[] = [];

  get size(): number {
    return this.data.length;
  }

  push(node: HeapNode): void {
    this.data.push(node);
    let idx = this.data.length - 1;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.compare(this.data[idx], this.data[parentIdx]) < 0) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[parentIdx];
        this.data[parentIdx] = tmp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      let idx = 0;
      const len = this.data.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < len && this.compare(this.data[left], this.data[smallest]) < 0) {
          smallest = left;
        }
        if (right < len && this.compare(this.data[right], this.data[smallest]) < 0) {
          smallest = right;
        }
        if (smallest === idx) break;
        const tmp = this.data[idx];
        this.data[idx] = this.data[smallest];
        this.data[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  }

  private compare(a: HeapNode, b: HeapNode): number {
    if (a.f !== b.f) return a.f - b.f;
    if (a.h !== b.h) return a.h - b.h;
    return a.rank - b.rank;
  }
}

function runAStar(
  start: string,
  target: string,
  ctx: SearchContext,
  recordLayers: boolean,
  nodeCap = Infinity
): InternalRunResult {
  const t0 = performance.now();
  const stats = { candidatesChecked: 0 };

  if (start === target) {
    return {
      path: [start],
      nodesVisited: 1,
      candidatesChecked: 0,
      frontierPeak: 1,
      durationMs: performance.now() - t0,
      meetingWord: start,
      meetingDepthForward: 0,
      meetingDepthBackward: 0,
      layers: recordLayers
        ? [{ side: 'forward', depth: 0, nodeCount: 1, sampleNodes: [start], pathNode: start }]
        : [],
    };
  }

  const heuristic = (w: string): number =>
    ctx.allowInsertDelete
      ? computeEditDistance(w, target)
      : computeHammingDistance(w, target).distance;

  const heap = new MinHeap();
  const h0 = heuristic(start);
  heap.push({ word: start, g: 0, h: h0, f: h0, rank: getWordRank(start) });

  const bestG = new Map<string, number>([[start, 0]]);
  const parent = new Map<string, string | null>([[start, null]]);
  const closed = new Set<string>();
  const depthBuckets = new Map<number, string[]>();
  depthBuckets.set(0, [start]);

  let nodesVisited = 1;
  let frontierPeak = 1;

  while (heap.size > 0 && nodesVisited < nodeCap) {
    if (heap.size > frontierPeak) frontierPeak = heap.size;
    const current = heap.pop()!;

    if (current.word === target) {
      const path = reconstructSingleSide(target, parent);
      const layers: FrontierLayer[] = [];
      if (recordLayers) {
        const depths = [...depthBuckets.keys()].sort((a, b) => a - b);
        for (const d of depths) {
          const nodes = depthBuckets.get(d)!;
          layers.push({
            side: 'forward',
            depth: d,
            nodeCount: nodes.length,
            sampleNodes: nodes.slice(0, 6),
          });
        }
      }
      return {
        path,
        nodesVisited,
        candidatesChecked: stats.candidatesChecked,
        frontierPeak,
        durationMs: performance.now() - t0,
        meetingWord: null,
        meetingDepthForward: current.g,
        meetingDepthBackward: 0,
        layers,
      };
    }

    if (closed.has(current.word)) continue;
    closed.add(current.word);

    const nextG = current.g + 1;
    const neighbors = getNeighbors(current.word, ctx, stats);

    for (let b = 0; b < neighbors.length; b++) {
      const neighbor = neighbors[b];
      if (closed.has(neighbor)) continue;

      const prevG = bestG.get(neighbor);
      if (prevG === undefined || nextG < prevG) {
        if (prevG === undefined) {
          nodesVisited++;
          if (recordLayers) {
            let arr = depthBuckets.get(nextG);
            if (!arr) {
              arr = [];
              depthBuckets.set(nextG, arr);
            }
            if (arr.length < 32) arr.push(neighbor);
          }
        }
        bestG.set(neighbor, nextG);
        parent.set(neighbor, current.word);
        const h = heuristic(neighbor);
        heap.push({
          word: neighbor,
          g: nextG,
          h,
          f: nextG + h,
          rank: getWordRank(neighbor),
        });
        if (nodesVisited >= nodeCap) break;
      }
    }
  }

  return {
    path: null,
    nodesVisited,
    candidatesChecked: stats.candidatesChecked,
    frontierPeak,
    durationMs: performance.now() - t0,
    meetingWord: null,
    meetingDepthForward: 0,
    meetingDepthBackward: 0,
    layers: [],
  };
}

function computeSmartBigramSubstitutePath(start: string, target: string): {
  path: string[];
  steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }>;
  candidatesEvaluated: number;
} {
  let current = start;
  const path: string[] = [start];
  const steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }> = [];
  let candidatesEvaluated = 0;

  while (current !== target) {
    let bestWord = '';
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < current.length; i++) {
      if (current[i] === target[i]) continue;
      const candidate = current.slice(0, i) + target[i] + current.slice(i + 1);
      candidatesEvaluated++;
      const score = scoreLinguisticNaturalness(candidate, i);
      if (score > bestScore) {
        bestScore = score;
        bestWord = candidate;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    steps.push({
      fromWord: current,
      toWord: bestWord,
      operation: 'substitute',
      changedIndex: bestIdx,
      fromChar: current[bestIdx],
      toChar: target[bestIdx],
    });
    current = bestWord;
    path.push(bestWord);
  }

  return { path, steps, candidatesEvaluated };
}

function checkWordStatus(word: string): WordCheckInfo {
  ensureDictionariesInitialized();
  const clean = word.trim().toLowerCase();
  const validFormat =
    clean.length >= 2 && clean.length <= MAX_WORD_LENGTH && ALPHA_RE.test(clean);
  if (!validFormat) {
    return {
      word: clean,
      inCommon: false,
      inExtended: false,
      validFormat: false,
    };
  }
  const len = clean.length;
  return {
    word: clean,
    inCommon: commonByLength!.get(len)?.has(clean) ?? false,
    inExtended: extendedByLength!.get(len)?.has(clean) ?? false,
    validFormat: true,
  };
}

function attachPathNodesToLayers(layers: FrontierLayer[], path: string[]): FrontierLayer[] {
  const pathSet = new Set(path);
  return layers.map((layer) => {
    const found = layer.sampleNodes.find((w) => pathSet.has(w));
    return {
      ...layer,
      pathNode: found ?? layer.pathNode,
    };
  });
}

function buildContext(mode: LexiconMode, length: number, allowInsertDelete: boolean): SearchContext {
  ensureDictionariesInitialized();
  if (allowInsertDelete) {
    return {
      wordSet: mode === 'common' ? commonAllWords! : extendedAllWords!,
      patternMap: null,
      allowInsertDelete: true,
    };
  }
  return {
    ...getLengthIndex(mode, length),
    allowInsertDelete: false,
  };
}

function runSingleEditFallback(
  start: string,
  target: string,
  algorithm: AlgorithmId,
  lexiconMode: LexiconMode,
  allowInsertDelete: boolean,
  strictDictionaryOnly: boolean,
  startStatus: WordCheckInfo,
  targetStatus: WordCheckInfo,
  fallbackReason: string,
  priorNodesPruned: number,
  priorCandidatesChecked: number
): SearchResult {
  const t0 = performance.now();
  const useSameLengthBigram = start.length === target.length && !allowInsertDelete;

  let path: string[];
  let steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }>;
  let fallbackCandidates = 0;

  if (useSameLengthBigram) {
    const res = computeSmartBigramSubstitutePath(start, target);
    path = res.path;
    steps = res.steps;
    fallbackCandidates = res.candidatesEvaluated;
  } else {
    const res = computeSingleEditPath(start, target);
    path = res.path;
    steps = res.steps;
    fallbackCandidates = (start.length + 1) * (target.length + 1);
  }

  const durationMs = performance.now() - t0;

  ensureDictionariesInitialized();
  const dictSet = extendedAllWords!;

  const stepChecks: TransitionStep[] = steps.map((s, idx) => ({
    stepNumber: idx + 1,
    fromWord: s.fromWord,
    toWord: s.toWord,
    operation: s.operation,
    changedIndex: s.changedIndex,
    fromChar: s.fromChar,
    toChar: s.toChar,
    editDistance: 1,
    isValidLength: s.fromWord.length === s.toWord.length,
    isSingleLetterChange: true,
    isInDictionary: dictSet.has(s.toWord),
  }));

  const allSameLength = start.length === target.length;
  const allInDictionary = path.every((w) => dictSet.has(w));

  return {
    found: true,
    usedFallbackMorph: true,
    usedEditBridge: false,
    fallbackReason,
    allowInsertDelete,
    strictDictionaryOnly,
    startWord: start,
    targetWord: target,
    path,
    steps: stepChecks,
    validation: {
      isValid: true,
      allSameLength,
      allSingleLetter: true,
      allInDictionary,
      endpointsMatch: true,
      stepChecks,
      errorMessages: [],
    },
    algorithmUsed: algorithm,
    lexiconMode,
    effectiveLexicon: lexiconMode,
    dictionarySize: dictSet.size,
    nodesVisited: steps.length + 1,
    candidatesChecked: priorCandidatesChecked + fallbackCandidates,
    nodesPruned: priorNodesPruned,
    frontierPeak: target.length + 1,
    durationMs,
    meetingWord: null,
    meetingDepthForward: steps.length,
    meetingDepthBackward: 0,
    layers: [],
    benchmarks: [],
    neighborsByWord: {},
    startStatus,
    targetStatus,
  };
}

function handleSearch(payload: NonNullable<WorkerRequest['payload']>): SearchResult {
  const start = payload.startWord.trim().toLowerCase();
  const target = payload.targetWord.trim().toLowerCase();
  const { algorithm, lexiconMode, allowInsertDelete, strictDictionaryOnly } = payload;

  const startStatus = checkWordStatus(start);
  const targetStatus = checkWordStatus(target);

  const emptyValidation = validateTransformationChain(
    [],
    start,
    target,
    new Set(),
    allowInsertDelete
  );

  if (!startStatus.validFormat || !targetStatus.validFormat) {
    return {
      found: false,
      usedFallbackMorph: false,
      usedEditBridge: false,
      allowInsertDelete,
      strictDictionaryOnly,
      startWord: start,
      targetWord: target,
      path: [],
      steps: [],
      validation: emptyValidation,
      algorithmUsed: algorithm,
      lexiconMode,
      effectiveLexicon: lexiconMode,
      dictionarySize: 0,
      nodesVisited: 0,
      candidatesChecked: 0,
      nodesPruned: 0,
      frontierPeak: 0,
      durationMs: 0,
      meetingWord: null,
      meetingDepthForward: 0,
      meetingDepthBackward: 0,
      layers: [],
      benchmarks: [],
      neighborsByWord: {},
      reason: `Enter two alphabetic words (A-Z, 2 to ${MAX_WORD_LENGTH} letters each).`,
      startStatus,
      targetStatus,
    };
  }

  const runAlgo = (
    algo: AlgorithmId,
    ctx: SearchContext,
    recordLayers: boolean,
    nodeCap = Infinity
  ): InternalRunResult => {
    if (algo === 'bidirectional-bfs') {
      return runBidirectionalBfs(start, target, ctx, recordLayers, nodeCap);
    }
    if (algo === 'astar-hamming') {
      return runAStar(start, target, ctx, recordLayers, nodeCap);
    }
    return runStandardBfs(start, target, ctx, recordLayers, nodeCap);
  };

  let priorNodesPruned = 0;
  let priorCandidatesChecked = 0;

  // Tier 1 & Tier 2: Real-word dictionary search (Common English -> Full 275k)
  const modesToTry: LexiconMode[] =
    lexiconMode === 'common' ? ['common', 'extended'] : ['extended'];

  for (const mode of modesToTry) {
    const startOk = mode === 'common' ? startStatus.inCommon : startStatus.inExtended;
    const targetOk = mode === 'common' ? targetStatus.inCommon : targetStatus.inExtended;
    if (!startOk || !targetOk) continue;
    if (start.length !== target.length && !allowInsertDelete) continue;

    const ctx = buildContext(mode, start.length, allowInsertDelete);
    const primary = runAlgo(algorithm, ctx, true);
    priorNodesPruned += primary.nodesVisited;
    priorCandidatesChecked += primary.candidatesChecked;

    if (primary.path) {
      const validation = validateTransformationChain(
        primary.path,
        start,
        target,
        ctx.wordSet,
        allowInsertDelete
      );

      const algoDefs: Array<{ id: AlgorithmId; label: string }> = [
        { id: 'bidirectional-bfs', label: 'Bidirectional BFS' },
        { id: 'astar-hamming', label: 'A* Heuristic' },
        { id: 'standard-bfs', label: 'Standard BFS' },
      ];

      const benchmarks: AlgorithmBenchmark[] = algoDefs.map(({ id, label }) => {
        if (id === algorithm) {
          return {
            algorithm: id,
            label,
            nodesVisited: primary.nodesVisited,
            frontierPeak: primary.frontierPeak,
            durationMs: primary.durationMs,
            pathLength: primary.path!.length - 1,
          };
        }
        const comp = runAlgo(id, ctx, false);
        return {
          algorithm: id,
          label,
          nodesVisited: comp.nodesVisited,
          frontierPeak: comp.frontierPeak,
          durationMs: comp.durationMs,
          pathLength: comp.path ? comp.path.length - 1 : 0,
        };
      });

      const neighborsByWord: Record<string, string[]> = {};
      for (const w of primary.path) {
        neighborsByWord[w] = getNeighbors(w, ctx).slice(0, 28);
      }

      return {
        found: true,
        usedFallbackMorph: false,
        usedEditBridge: false,
        allowInsertDelete,
        strictDictionaryOnly,
        startWord: start,
        targetWord: target,
        path: primary.path,
        steps: validation.stepChecks,
        validation,
        algorithmUsed: algorithm,
        lexiconMode,
        effectiveLexicon: mode,
        dictionarySize: ctx.wordSet.size,
        nodesVisited: primary.nodesVisited,
        candidatesChecked: primary.candidatesChecked,
        nodesPruned: Math.max(0, primary.nodesVisited - primary.path.length),
        frontierPeak: primary.frontierPeak,
        durationMs: primary.durationMs,
        meetingWord: primary.meetingWord,
        meetingDepthForward: primary.meetingDepthForward,
        meetingDepthBackward: primary.meetingDepthBackward,
        layers: attachPathNodesToLayers(primary.layers, primary.path),
        benchmarks,
        neighborsByWord,
        startStatus,
        targetStatus,
      };
    }
  }

  // Tier 2.5: Bounded Bidirectional Edit-Graph Bridge (1-letter insert/delete/substitute
  // across real dictionary words ONLY) when fixed-length substitution couldn't bridge islands
  // (e.g., brother -> bother -> nother -> another, evening -> ... -> morning).
  if (
    !allowInsertDelete &&
    startStatus.inExtended &&
    targetStatus.inExtended
  ) {
    const bridgeCtx = buildContext('extended', start.length, true);
    const bridgeRes = runAlgo(algorithm, bridgeCtx, true, EDIT_BRIDGE_NODE_CAP);
    priorNodesPruned += bridgeRes.nodesVisited;
    priorCandidatesChecked += bridgeRes.candidatesChecked;

    if (bridgeRes.path) {
      const validation = validateTransformationChain(
        bridgeRes.path,
        start,
        target,
        bridgeCtx.wordSet,
        true
      );
      const neighborsByWord: Record<string, string[]> = {};
      for (const w of bridgeRes.path) {
        neighborsByWord[w] = getNeighbors(w, bridgeCtx).slice(0, 28);
      }
      return {
        found: true,
        usedFallbackMorph: false,
        usedEditBridge: true,
        allowInsertDelete: true,
        strictDictionaryOnly,
        startWord: start,
        targetWord: target,
        path: bridgeRes.path,
        steps: validation.stepChecks,
        validation,
        algorithmUsed: algorithm,
        lexiconMode,
        effectiveLexicon: 'extended',
        dictionarySize: bridgeCtx.wordSet.size,
        nodesVisited: bridgeRes.nodesVisited,
        candidatesChecked: priorCandidatesChecked,
        nodesPruned: Math.max(0, bridgeRes.nodesVisited - bridgeRes.path.length),
        frontierPeak: bridgeRes.frontierPeak,
        durationMs: bridgeRes.durationMs,
        meetingWord: bridgeRes.meetingWord,
        meetingDepthForward: bridgeRes.meetingDepthForward,
        meetingDepthBackward: bridgeRes.meetingDepthBackward,
        layers: attachPathNodesToLayers(bridgeRes.layers, bridgeRes.path),
        benchmarks: [],
        neighborsByWord,
        startStatus,
        targetStatus,
      };
    }
  }

  // Tier 3: Linguistic Bigram-Guided Single-Letter Fallback for isolated ultra-long words
  if (!strictDictionaryOnly) {
    const bothInExtended = startStatus.inExtended && targetStatus.inExtended;
    const reasonText = !bothInExtended
      ? `No 1-letter dictionary bridge exists for these ${start.length}-letter inputs — using bigram-guided single-letter transformation.`
      : `Pruned ${priorNodesPruned.toLocaleString()} dictionary words (${priorCandidatesChecked.toLocaleString()} candidates checked) with no real-word bridge — using bigram-guided single-letter transformation.`;

    return runSingleEditFallback(
      start,
      target,
      algorithm,
      lexiconMode,
      allowInsertDelete,
      strictDictionaryOnly,
      startStatus,
      targetStatus,
      reasonText,
      priorNodesPruned,
      priorCandidatesChecked
    );
  }

  const extCtx = buildContext('extended', start.length, allowInsertDelete);
  const startComponentSize = measureComponentSize(start, extCtx, 300);
  const targetComponentSize = measureComponentSize(target, extCtx, 300);

  return {
    found: false,
    usedFallbackMorph: false,
    usedEditBridge: false,
    allowInsertDelete,
    strictDictionaryOnly,
    startWord: start,
    targetWord: target,
    path: [],
    steps: [],
    validation: emptyValidation,
    algorithmUsed: algorithm,
    lexiconMode,
    effectiveLexicon: 'extended',
    dictionarySize: extCtx.wordSet.size,
    nodesVisited: priorNodesPruned,
    candidatesChecked: priorCandidatesChecked,
    nodesPruned: priorNodesPruned,
    frontierPeak: 0,
    durationMs: 0,
    meetingWord: null,
    meetingDepthForward: 0,
    meetingDepthBackward: 0,
    layers: [],
    benchmarks: [],
    neighborsByWord: {},
    startComponentSize,
    targetComponentSize,
    reason:
      start.length !== target.length && !allowInsertDelete
        ? `Strict dictionary mode requires equal lengths (${start.length} vs ${target.length}) unless add/remove 1 letter is enabled.`
        : `No real-word 1-letter chain connects "${start}" to "${target}" after checking ${priorCandidatesChecked.toLocaleString()} candidates (${priorNodesPruned.toLocaleString()} words explored).`,
    startStatus,
    targetStatus,
  };
}

function handleRandomPair(
  params: NonNullable<WorkerRequest['randomPayload']>
): { startWord: string; targetWord: string } {
  ensureDictionariesInitialized();

  const { lexiconMode, allowInsertDelete, excludeStart, excludeTarget } = params;
  const preferredLengths = allowInsertDelete
    ? [4, 4, 5, 5, 6, 6, 7]
    : [4, 4, 4, 5, 5, 5, 6, 6, 7, 8];

  const byLength = lexiconMode === 'common' ? commonByLength! : extendedByLength!;
  const maxAttempts = 24;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const len = preferredLengths[Math.floor(Math.random() * preferredLengths.length)];
    const poolSet = byLength.get(len) ?? commonByLength!.get(len);
    if (!poolSet || poolSet.size < 2) continue;

    const pool = Array.from(poolSet);
    const seed = pool[Math.floor(Math.random() * pool.length)];
    const ctx = buildContext(lexiconMode, len, allowInsertDelete);

    const visited = new Set<string>([seed]);
    let frontier: string[] = [seed];
    const idealCandidates: string[] = [];
    const fallbackCandidates: string[] = [];
    const maxDepth = allowInsertDelete ? 5 : 7;

    for (let depth = 1; depth <= maxDepth && frontier.length > 0 && visited.size < 650; depth++) {
      const nextFrontier: string[] = [];
      for (let i = 0; i < frontier.length; i++) {
        const nbrs = getNeighbors(frontier[i], ctx);
        for (let j = 0; j < nbrs.length; j++) {
          const n = nbrs[j];
          if (visited.has(n)) continue;
          visited.add(n);
          nextFrontier.push(n);

          if (depth >= 4 && depth <= 7) {
            if (!allowInsertDelete || Math.random() < 0.7 || n.length !== seed.length) {
              idealCandidates.push(n);
            }
          } else if (depth >= 2) {
            fallbackCandidates.push(n);
          }

          if (visited.size >= 650) break;
        }
        if (visited.size >= 650) break;
      }
      frontier = nextFrontier;
    }

    const candidates =
      idealCandidates.length > 0 ? idealCandidates : fallbackCandidates;
    const filtered = candidates.filter(
      (w) =>
        w !== seed &&
        !(seed === excludeStart?.toLowerCase() && w === excludeTarget?.toLowerCase())
    );

    if (filtered.length > 0) {
      const targetWord = filtered[Math.floor(Math.random() * filtered.length)];
      return { startWord: seed, targetWord };
    }
  }

  return { startWord: 'cold', targetWord: 'warm' };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload, randomPayload } = event.data;
  try {
    if (type === 'warmup') {
      ensureDictionariesInitialized();
      ensureBigramModelInitialized();
      const resp: WorkerResponse = { id, type: 'ready' };
      self.postMessage(resp);
      return;
    }

    if (type === 'random-pair') {
      const pair = handleRandomPair(
        randomPayload ?? { lexiconMode: 'common', allowInsertDelete: false }
      );
      const resp: WorkerResponse = { id, type: 'random-pair', pair };
      self.postMessage(resp);
      return;
    }

    if (type === 'search' && payload) {
      const result = handleSearch(payload);
      const resp: WorkerResponse = { id, type: 'result', result };
      self.postMessage(resp);
    }
  } catch (err) {
    const resp: WorkerResponse = {
      id,
      type: 'error',
      error: err instanceof Error ? err.message : 'Unexpected worker error',
    };
    self.postMessage(resp);
  }
};
