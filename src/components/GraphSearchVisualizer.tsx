import { GitMerge, Network } from 'lucide-react';
import { useState } from 'react';
import type { AlgorithmId, FrontierLayer } from '../types/wordGraph';
import { detectSingleEdit } from '../utils/pathValidator';

interface GraphSearchVisualizerProps {
  algorithmUsed: AlgorithmId;
  usedFallbackMorph: boolean;
  path: string[];
  activeStepIndex: number;
  layers: FrontierLayer[];
  meetingWord: string | null;
  meetingDepthForward: number;
  meetingDepthBackward: number;
  neighborsByWord: Record<string, string[]>;
  onSelectStep: (index: number) => void;
  onExploreNeighborAsStart: (word: string) => void;
}

export function GraphSearchVisualizer({
  algorithmUsed,
  usedFallbackMorph,
  path,
  activeStepIndex,
  layers,
  meetingWord,
  meetingDepthForward,
  meetingDepthBackward,
  neighborsByWord,
  onSelectStep,
  onExploreNeighborAsStart,
}: GraphSearchVisualizerProps) {
  const [activeTab, setActiveTab] = useState<'frontiers' | 'branches'>('frontiers');

  if (path.length === 0) return null;

  const activeWord = path[activeStepIndex] ?? path[0];
  const nextPathWord = activeStepIndex < path.length - 1 ? path[activeStepIndex + 1] : null;
  const prevPathWord = activeStepIndex > 0 ? path[activeStepIndex - 1] : null;
  const neighbors = neighborsByWord[activeWord] ?? [];

  const forwardLayers = layers
    .filter((l) => l.side === 'forward')
    .sort((a, b) => a.depth - b.depth);
  const backwardLayers = layers
    .filter((l) => l.side === 'backward')
    .sort((a, b) => a.depth - b.depth);

  const pathSet = new Set(path);

  if (usedFallbackMorph) {
    return (
      <section
        id="graph-process"
        aria-label="Fallback single-letter solver overview"
        className="rounded-xl border border-line bg-surface p-4 transition-colors"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Direct Single-Letter Alignment
          </h2>
          <span className="font-mono text-xs text-ink-subtle tabular-nums">
            {path.length - 1} minimal edits
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Because no 1-letter real-word bridge connects these words in the 275k English
          dictionary, the solver computes the provably shortest character-by-character edit
          alignment while keeping every step to a single-letter change.
        </p>
      </section>
    );
  }

  return (
    <section
      id="graph-process"
      aria-label="Graph search frontier and branching explorer"
      className="rounded-xl border border-line bg-surface p-4 space-y-3 transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-2.5">
        <div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Graph Search Process
          </h2>
          {algorithmUsed === 'bidirectional-bfs' && meetingWord && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-accent-text font-mono">
              <GitMerge className="h-3.5 w-3.5" />
              <span>
                bridge: {meetingWord} (d={meetingDepthForward} + d&apos;={meetingDepthBackward})
              </span>
            </div>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Graph inspection view"
          className="inline-flex items-center rounded-lg bg-surface-alt p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'frontiers'}
            onClick={() => setActiveTab('frontiers')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'frontiers'
                ? 'bg-surface text-ink shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            Frontier Layers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'branches'}
            onClick={() => setActiveTab('branches')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'branches'
                ? 'bg-surface text-ink shadow-xs'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            1-Letter Branches ({neighbors.length})
          </button>
        </div>
      </div>

      {activeTab === 'frontiers' ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface-alt p-3 max-h-[210px] overflow-y-auto">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">
                {algorithmUsed === 'bidirectional-bfs'
                  ? 'Forward Frontier'
                  : 'Search Wavefront'}
              </span>
              <span className="font-mono text-ink-subtle tabular-nums">
                {forwardLayers.length} layers
              </span>
            </div>

            <div className="space-y-2">
              {forwardLayers.map((layer) => (
                <div
                  key={`fwd-${layer.depth}`}
                  className="flex items-start justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="shrink-0 font-mono text-[11px] text-ink-subtle tabular-nums">
                    d={layer.depth} ({layer.nodeCount})
                  </div>
                  <div className="flex flex-wrap justify-end gap-1 font-mono text-[11px]">
                    {layer.sampleNodes.map((node) => {
                      const onPath = pathSet.has(node);
                      const isBridge = node === meetingWord;
                      const pathIdx = path.indexOf(node);
                      return (
                        <button
                          key={node}
                          type="button"
                          onClick={() => {
                            if (pathIdx >= 0) onSelectStep(pathIdx);
                          }}
                          disabled={pathIdx < 0}
                          className={`rounded px-1.5 py-0.5 transition-colors ${
                            isBridge
                              ? 'bg-accent text-accent-ink font-semibold cursor-pointer'
                              : onPath
                              ? 'bg-accent-soft text-accent-text border border-accent-border font-semibold cursor-pointer'
                              : 'bg-surface text-ink-subtle border border-line cursor-default'
                          }`}
                        >
                          {node}
                        </button>
                      );
                    })}
                    {layer.nodeCount > layer.sampleNodes.length && (
                      <span className="px-1 py-0.5 text-[11px] text-ink-subtle tabular-nums">
                        +{layer.nodeCount - layer.sampleNodes.length}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {algorithmUsed === 'bidirectional-bfs' ? (
            <div className="rounded-lg border border-line bg-surface-alt p-3 max-h-[210px] overflow-y-auto">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-ink">Backward Frontier</span>
                <span className="font-mono text-ink-subtle tabular-nums">
                  {backwardLayers.length} layers
                </span>
              </div>

              <div className="space-y-2">
                {backwardLayers.map((layer) => (
                  <div
                    key={`bwd-${layer.depth}`}
                    className="flex items-start justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="shrink-0 font-mono text-[11px] text-ink-subtle tabular-nums">
                      d&apos;={layer.depth} ({layer.nodeCount})
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 font-mono text-[11px]">
                      {layer.sampleNodes.map((node) => {
                        const onPath = pathSet.has(node);
                        const isBridge = node === meetingWord;
                        const pathIdx = path.indexOf(node);
                        return (
                          <button
                            key={node}
                            type="button"
                            onClick={() => {
                              if (pathIdx >= 0) onSelectStep(pathIdx);
                            }}
                            disabled={pathIdx < 0}
                            className={`rounded px-1.5 py-0.5 transition-colors ${
                              isBridge
                                ? 'bg-accent text-accent-ink font-semibold cursor-pointer'
                                : onPath
                                ? 'bg-good-soft text-good-text border border-good-border font-semibold cursor-pointer'
                                : 'bg-surface text-ink-subtle border border-line cursor-default'
                            }`}
                          >
                            {node}
                          </button>
                        );
                      })}
                      {layer.nodeCount > layer.sampleNodes.length && (
                        <span className="px-1 py-0.5 text-[11px] text-ink-subtle tabular-nums">
                          +{layer.nodeCount - layer.sampleNodes.length}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface-alt p-3 flex flex-col justify-between">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Network className="h-3.5 w-3.5 text-ink-subtle" />
                  <span>Single-Direction Expansion</span>
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">
                  Unidirectional search expands to radius{' '}
                  <span className="font-mono font-medium text-ink">d = {path.length - 1}</span>
                  . Meeting in the middle via Bidirectional BFS in Settings reduces work
                  from <span className="font-mono">b^d</span> toward{' '}
                  <span className="font-mono">2 · b^(d/2)</span>.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-ink-muted">
              Neighbors of{' '}
              <span className="font-mono font-semibold text-accent-text">
                &ldquo;{activeWord}&rdquo;
              </span>{' '}
              (click any to re-trace from it)
            </span>
          </div>

          {neighbors.length === 0 ? (
            <p className="text-xs text-ink-subtle">
              No adjacent 1-letter dictionary words found from this word.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-[190px] overflow-y-auto pr-1">
              {neighbors.map((nbr) => {
                const isNextOnPath = nbr === nextPathWord;
                const isPrevOnPath = nbr === prevPathWord;
                const edit = detectSingleEdit(activeWord, nbr);
                return (
                  <button
                    key={nbr}
                    type="button"
                    onClick={() => onExploreNeighborAsStart(nbr)}
                    title={`Trace path from "${nbr}" to "${path[path.length - 1]}"`}
                    className={`flex items-center justify-between rounded-lg border px-2 py-1.5 font-mono text-xs transition-colors cursor-pointer ${
                      isNextOnPath
                        ? 'border-accent bg-accent-soft text-accent-text font-semibold'
                        : isPrevOnPath
                        ? 'border-good-border bg-good-soft text-good-text'
                        : 'border-line bg-surface text-ink-muted hover:text-ink hover:bg-surface-alt'
                    }`}
                  >
                    <span className="truncate">
                      {nbr.split('').map((c, i) => (
                        <span
                          key={i}
                          className={
                            edit.operation !== 'delete' && i === edit.changedIndex
                              ? 'underline decoration-2 underline-offset-2 font-semibold'
                              : ''
                          }
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                    <span className="ml-1 text-[10px] text-ink-subtle">
                      {isNextOnPath
                        ? 'next'
                        : isPrevOnPath
                        ? 'prev'
                        : edit.operation === 'insert'
                        ? `+${edit.toChar}`
                        : edit.operation === 'delete'
                        ? `-${edit.fromChar}`
                        : `p${edit.changedIndex + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
