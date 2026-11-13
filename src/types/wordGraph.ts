export type AlgorithmId = 'bidirectional-bfs' | 'astar-hamming' | 'standard-bfs';

export type LexiconMode = 'common' | 'extended' | 'mega';

export type UiDesignId = 'archival' | 'editorial' | 'blueprint' | 'terminal';

export interface TransitionStep {
  stepNumber: number;
  fromWord: string;
  toWord: string;
  operation: 'substitute' | 'insert' | 'delete';
  changedIndex: number;
  fromChar: string;
  toChar: string;
  editDistance: number;
  isValidLength: boolean;
  isSingleLetterChange: boolean;
  isInDictionary: boolean;
}

export interface ValidationReport {
  isValid: boolean;
  allSameLength: boolean;
  allSingleLetter: boolean;
  allInDictionary: boolean;
  endpointsMatch: boolean;
  stepChecks: TransitionStep[];
  errorMessages: string[];
}

export interface FrontierLayer {
  side: 'forward' | 'backward';
  depth: number;
  nodeCount: number;
  sampleNodes: string[];
  pathNode?: string;
}

export interface AlgorithmBenchmark {
  algorithm: AlgorithmId;
  label: string;
  nodesVisited: number;
  frontierPeak: number;
  durationMs: number;
  pathLength: number;
}

export interface WordCheckInfo {
  word: string;
  inCommon: boolean;
  inExtended: boolean;
  validFormat: boolean;
}

export interface SearchResult {
  found: boolean;
  usedFallbackMorph: boolean;
  usedEditBridge: boolean;
  fallbackReason?: string;
  allowInsertDelete: boolean;
  strictDictionaryOnly: boolean;
  startWord: string;
  targetWord: string;
  path: string[];
  steps: TransitionStep[];
  validation: ValidationReport;
  algorithmUsed: AlgorithmId;
  lexiconMode: LexiconMode;
  effectiveLexicon: LexiconMode;
  dictionarySize: number;
  nodesVisited: number;
  candidatesChecked: number;
  nodesPruned: number;
  frontierPeak: number;
  durationMs: number;
  meetingWord: string | null;
  meetingDepthForward: number;
  meetingDepthBackward: number;
  layers: FrontierLayer[];
  benchmarks: AlgorithmBenchmark[];
  neighborsByWord: Record<string, string[]>;
  reason?: string;
  startComponentSize?: number;
  targetComponentSize?: number;
  startStatus: WordCheckInfo;
  targetStatus: WordCheckInfo;
}

export interface WorkerRequest {
  id: number;
  type: 'search' | 'warmup' | 'random-pair';
  payload?: {
    startWord: string;
    targetWord: string;
    algorithm: AlgorithmId;
    lexiconMode: LexiconMode;
    allowInsertDelete: boolean;
    strictDictionaryOnly: boolean;
  };
  randomPayload?: {
    lexiconMode: LexiconMode;
    allowInsertDelete: boolean;
    excludeStart?: string;
    excludeTarget?: string;
  };
}

export interface WorkerResponse {
  id: number;
  type: 'ready' | 'result' | 'random-pair' | 'error';
  result?: SearchResult;
  pair?: {
    startWord: string;
    targetWord: string;
  };
  error?: string;
}
