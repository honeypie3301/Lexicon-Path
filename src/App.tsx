import { AlertTriangle, GitBranchPlus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlgorithmInspector } from './components/AlgorithmInspector';
import { GraphSearchVisualizer } from './components/GraphSearchVisualizer';
import { LetterMorphStage } from './components/LetterMorphStage';
import { TopBar } from './components/TopBar';
import { TransformationChain } from './components/TransformationChain';
import { EXAMPLE_PAIRS, type ExamplePair, WordInputBar } from './components/WordInputBar';
import { graphClient } from './services/graphWorkerClient';
import type {
  AlgorithmId,
  LexiconMode,
  SearchResult,
  UiDesignId,
} from './types/wordGraph';

const UI_DESIGN_STORAGE_KEY = 'lexicon-path-ui-design-v2';

function getInitialUiDesign(): UiDesignId {
  try {
    const saved = window.localStorage.getItem(UI_DESIGN_STORAGE_KEY);
    if (
      saved === 'archival' ||
      saved === 'editorial' ||
      saved === 'blueprint' ||
      saved === 'terminal'
    ) {
      return saved;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'archival';
}

export default function App() {
  const [startInput, setStartInput] = useState('fish');
  const [targetInput, setTargetInput] = useState('boat');
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('bidirectional-bfs');
  const [lexiconMode, setLexiconMode] = useState<LexiconMode>('common');
  const [allowInsertDelete, setAllowInsertDelete] = useState(false);
  const [strictDictionaryOnly, setStrictDictionaryOnly] = useState(false);
  const [uiDesign, setUiDesign] = useState<UiDesignId>(getInitialUiDesign);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);

  const latestRequestId = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-ui-theme', uiDesign);
    if (uiDesign === 'blueprint' || uiDesign === 'terminal') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem(UI_DESIGN_STORAGE_KEY, uiDesign);
    } catch {
      // Ignore storage write errors
    }
  }, [uiDesign]);

  const executeSearch = useCallback(
    async (params: {
      startWord: string;
      targetWord: string;
      algorithm: AlgorithmId;
      lexiconMode: LexiconMode;
      allowInsertDelete: boolean;
      strictDictionaryOnly: boolean;
    }) => {
      const reqId = ++latestRequestId.current;
      setIsSearching(true);
      setErrorMessage(null);
      setIsPlaying(false);

      try {
        const res = await graphClient.search(params);
        if (reqId !== latestRequestId.current) return;
        setResult(res);
        setActiveStepIndex(0);
      } catch (err) {
        if (reqId !== latestRequestId.current) return;
        setErrorMessage(
          err instanceof Error ? err.message : 'Unable to execute graph search.'
        );
      } finally {
        if (reqId === latestRequestId.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void graphClient.warmup();
    void executeSearch({
      startWord: 'fish',
      targetWord: 'boat',
      algorithm: 'bidirectional-bfs',
      lexiconMode: 'common',
      allowInsertDelete: false,
      strictDictionaryOnly: false,
    });
  }, [executeSearch]);

  useEffect(() => {
    if (!isPlaying || !result?.found || result.path.length <= 1) return;

    const intervalMs = Math.round(950 / speedMultiplier);
    const timer = window.setInterval(() => {
      setActiveStepIndex((prev) => {
        if (prev >= result.path.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, result, speedMultiplier]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!result?.found || result.path.length === 0) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setActiveStepIndex((prev) => Math.min(result.path.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setActiveStepIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => {
          if (!prev && activeStepIndex >= result.path.length - 1) {
            setActiveStepIndex(0);
          }
          return !prev;
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [result, activeStepIndex]);

  const handleSubmit = () => {
    void executeSearch({
      startWord: startInput,
      targetWord: targetInput,
      algorithm,
      lexiconMode,
      allowInsertDelete,
      strictDictionaryOnly,
    });
  };

  const handleSwap = () => {
    const nextStart = targetInput;
    const nextTarget = startInput;
    setStartInput(nextStart);
    setTargetInput(nextTarget);
    if (nextStart.trim() && nextTarget.trim()) {
      void executeSearch({
        startWord: nextStart,
        targetWord: nextTarget,
        algorithm,
        lexiconMode,
        allowInsertDelete,
        strictDictionaryOnly,
      });
    }
  };

  const handleSelectExample = (pair: ExamplePair) => {
    const nextLexicon = pair.recommendedLexicon ?? lexiconMode;
    const nextInsertDelete = pair.recommendedInsertDelete ?? false;
    setStartInput(pair.start);
    setTargetInput(pair.target);
    setLexiconMode(nextLexicon);
    setAllowInsertDelete(nextInsertDelete);
    void executeSearch({
      startWord: pair.start,
      targetWord: pair.target,
      algorithm,
      lexiconMode: nextLexicon,
      allowInsertDelete: nextInsertDelete,
      strictDictionaryOnly,
    });
  };

  const handleTryRandomPair = async () => {
    setIsSearching(true);
    setErrorMessage(null);
    try {
      const pair = await graphClient.getRandomPair({
        lexiconMode,
        allowInsertDelete,
        excludeStart: startInput,
        excludeTarget: targetInput,
      });
      setStartInput(pair.startWord);
      setTargetInput(pair.targetWord);
      await executeSearch({
        startWord: pair.startWord,
        targetWord: pair.targetWord,
        algorithm,
        lexiconMode,
        allowInsertDelete,
        strictDictionaryOnly,
      });
    } catch (err) {
      setIsSearching(false);
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to pick a random word pair.'
      );
    }
  };

  const handleAlgorithmChange = (nextAlgo: AlgorithmId) => {
    setAlgorithm(nextAlgo);
    if (startInput.trim() && targetInput.trim()) {
      void executeSearch({
        startWord: startInput,
        targetWord: targetInput,
        algorithm: nextAlgo,
        lexiconMode,
        allowInsertDelete,
        strictDictionaryOnly,
      });
    }
  };

  const handleLexiconChange = (nextMode: LexiconMode) => {
    setLexiconMode(nextMode);
    if (startInput.trim() && targetInput.trim()) {
      void executeSearch({
        startWord: startInput,
        targetWord: targetInput,
        algorithm,
        lexiconMode: nextMode,
        allowInsertDelete,
        strictDictionaryOnly,
      });
    }
  };

  const handleToggleInsertDelete = (allow: boolean) => {
    setAllowInsertDelete(allow);
    if (startInput.trim() && targetInput.trim()) {
      void executeSearch({
        startWord: startInput,
        targetWord: targetInput,
        algorithm,
        lexiconMode,
        allowInsertDelete: allow,
        strictDictionaryOnly,
      });
    }
  };

  const handleToggleStrictDictionary = (strict: boolean) => {
    setStrictDictionaryOnly(strict);
    if (startInput.trim() && targetInput.trim()) {
      void executeSearch({
        startWord: startInput,
        targetWord: targetInput,
        algorithm,
        lexiconMode,
        allowInsertDelete,
        strictDictionaryOnly: strict,
      });
    }
  };

  const handleTogglePlay = () => {
    if (!result?.found) return;
    if (!isPlaying && activeStepIndex >= result.path.length - 1) {
      setActiveStepIndex(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setActiveStepIndex(0);
  };

  const handleExploreNeighborAsStart = (word: string) => {
    setStartInput(word);
    void executeSearch({
      startWord: word,
      targetWord: targetInput,
      algorithm,
      lexiconMode,
      allowInsertDelete,
      strictDictionaryOnly,
    });
  };

  return (
    <div id="top" className="min-h-screen bg-canvas text-ink transition-colors">
      <TopBar onTryAnotherPair={handleTryRandomPair} />

      <main className="mx-auto max-w-[1360px] px-6 py-4 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1
            className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink"
            style={{ textWrap: 'balance' }}
          >
            Single-Letter Word Transformation Explorer
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted">
            Prioritizes real English words via graph search, with optimal single-letter fallback for isolated long words.
          </p>
        </div>

        <WordInputBar
          startInput={startInput}
          targetInput={targetInput}
          algorithm={algorithm}
          lexiconMode={lexiconMode}
          allowInsertDelete={allowInsertDelete}
          strictDictionaryOnly={strictDictionaryOnly}
          uiDesign={uiDesign}
          isSearching={isSearching}
          onStartChange={setStartInput}
          onTargetChange={setTargetInput}
          onSwap={handleSwap}
          onSubmit={handleSubmit}
          onSelectExample={handleSelectExample}
          onAlgorithmChange={handleAlgorithmChange}
          onLexiconChange={handleLexiconChange}
          onToggleInsertDelete={handleToggleInsertDelete}
          onToggleStrictDictionary={handleToggleStrictDictionary}
          onUiDesignChange={setUiDesign}
        />

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-warn-border bg-warn-soft p-3.5 text-sm text-warn-text"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isSearching && !result && (
          <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-ink-muted">
            Indexing English lexicon and running Bidirectional BFS...
          </div>
        )}

        {result && !result.found && (
          <div className="rounded-xl border border-warn-border bg-surface p-5 transition-colors">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn-text" />
              <div className="space-y-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">
                    No Real-Word Chain Found
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-ink-muted leading-relaxed">
                    {result.reason}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {strictDictionaryOnly && (
                    <button
                      type="button"
                      onClick={() => handleToggleStrictDictionary(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover transition-colors cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Use Single-Letter Fallback</span>
                    </button>
                  )}

                  {!allowInsertDelete &&
                    result.startStatus.inExtended &&
                    result.targetStatus.inExtended && (
                      <button
                        type="button"
                        onClick={() => handleToggleInsertDelete(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-surface-alt transition-colors cursor-pointer"
                      >
                        <GitBranchPlus className="h-3.5 w-3.5" />
                        <span>Allow Add/Remove 1 Letter</span>
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => handleSelectExample(EXAMPLE_PAIRS[0])}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-alt px-3.5 py-2 text-xs font-semibold text-ink hover:bg-surface transition-colors cursor-pointer"
                  >
                    <span>Reset to fish → boat</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {result && result.found && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(320px,1fr)] lg:items-start">
            <div className="space-y-4">
              <LetterMorphStage
                path={result.path}
                steps={result.steps}
                allowInsertDelete={result.allowInsertDelete}
                usedFallbackMorph={result.usedFallbackMorph}
                fallbackReason={result.fallbackReason}
                activeStepIndex={activeStepIndex}
                isPlaying={isPlaying}
                speedMultiplier={speedMultiplier}
                onSelectStep={(idx) => {
                  setIsPlaying(false);
                  setActiveStepIndex(idx);
                }}
                onTogglePlay={handleTogglePlay}
                onReset={handleReset}
                onSpeedChange={setSpeedMultiplier}
              />

              <TransformationChain
                path={result.path}
                steps={result.steps}
                usedFallbackMorph={result.usedFallbackMorph}
                activeStepIndex={activeStepIndex}
                meetingWord={result.meetingWord}
                onSelectStep={(idx) => {
                  setIsPlaying(false);
                  setActiveStepIndex(idx);
                }}
              />

              <GraphSearchVisualizer
                algorithmUsed={result.algorithmUsed}
                usedFallbackMorph={result.usedFallbackMorph}
                path={result.path}
                activeStepIndex={activeStepIndex}
                layers={result.layers}
                meetingWord={result.meetingWord}
                meetingDepthForward={result.meetingDepthForward}
                meetingDepthBackward={result.meetingDepthBackward}
                neighborsByWord={result.neighborsByWord}
                onSelectStep={(idx) => {
                  setIsPlaying(false);
                  setActiveStepIndex(idx);
                }}
                onExploreNeighborAsStart={handleExploreNeighborAsStart}
              />
            </div>

            <AlgorithmInspector result={result} />
          </div>
        )}
      </main>
    </div>
  );
}
