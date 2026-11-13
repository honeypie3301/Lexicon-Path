import { ArrowRight, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { motion } from 'motion/react';
import type { TransitionStep } from '../types/wordGraph';
import { computeEditDistance, computeHammingDistance } from '../utils/pathValidator';

interface LetterMorphStageProps {
  path: string[];
  steps: TransitionStep[];
  allowInsertDelete: boolean;
  usedFallbackMorph: boolean;
  fallbackReason?: string;
  activeStepIndex: number;
  isPlaying: boolean;
  speedMultiplier: number;
  onSelectStep: (index: number) => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
}

function getTileSizing(wordLen: number): {
  box: string;
  text: string;
  gap: string;
  dense: boolean;
} {
  if (wordLen <= 6) {
    return {
      box: 'h-12 w-10 sm:h-14 sm:w-12',
      text: 'text-2xl sm:text-3xl',
      gap: 'gap-2',
      dense: false,
    };
  }
  if (wordLen <= 12) {
    return {
      box: 'h-10 w-8 sm:h-11 sm:w-9',
      text: 'text-lg sm:text-xl',
      gap: 'gap-1.5',
      dense: false,
    };
  }
  if (wordLen <= 20) {
    return {
      box: 'h-9 w-7',
      text: 'text-sm sm:text-base',
      gap: 'gap-1',
      dense: true,
    };
  }
  return {
    box: 'h-8 w-6',
    text: 'text-xs sm:text-sm',
    gap: 'gap-0.5',
    dense: true,
  };
}

export function LetterMorphStage({
  path,
  steps,
  allowInsertDelete,
  usedFallbackMorph,
  fallbackReason,
  activeStepIndex,
  isPlaying,
  speedMultiplier,
  onSelectStep,
  onTogglePlay,
  onReset,
  onSpeedChange,
}: LetterMorphStageProps) {
  if (path.length === 0) return null;

  const currentWord = path[activeStepIndex] ?? path[0];
  const targetWord = path[path.length - 1];
  const prevStep = activeStepIndex > 0 ? steps[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex < steps.length ? steps[activeStepIndex] : null;

  const activeTransition = prevStep ?? nextStep;
  const isArrivedChange = prevStep !== null;
  const highlightedIndex =
    activeTransition && !(isArrivedChange && activeTransition.operation === 'delete')
      ? activeTransition.changedIndex
      : -1;

  const sameLength = currentWord.length === targetWord.length;
  const remainingDelta =
    sameLength && !allowInsertDelete
      ? computeHammingDistance(currentWord, targetWord).distance
      : computeEditDistance(currentWord, targetWord);

  const sizing = getTileSizing(currentWord.length);

  const describeStep = (step: TransitionStep): string => {
    if (step.operation === 'substitute') {
      return `replaced pos ${step.changedIndex + 1} (${step.fromChar} → ${step.toChar})`;
    }
    if (step.operation === 'insert') {
      return `inserted "${step.toChar}" at pos ${step.changedIndex + 1}`;
    }
    return `removed "${step.fromChar}" at pos ${step.changedIndex + 1}`;
  };

  return (
    <section
      id="transformation-stage"
      aria-label="Interactive letter transformation stage"
      className="rounded-xl border border-line bg-surface p-4 transition-colors"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-2.5">
        <div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Letter-by-Letter Transformation
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {activeStepIndex === 0 && nextStep
              ? `Initial state. Next: ${describeStep(nextStep)}.`
              : prevStep
              ? `Step ${activeStepIndex}/${steps.length}: ${describeStep(prevStep)}.`
              : `Reached target word.`}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-subtle font-mono tabular-nums">
          <span>
            Step {activeStepIndex}/{steps.length}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {sameLength && !allowInsertDelete
              ? `Hamming left: ${remainingDelta}`
              : `Edits left: ${remainingDelta}`}
          </span>
        </div>
      </div>

      {usedFallbackMorph && fallbackReason && (
        <div className="mt-2.5 rounded-lg border border-warn-border bg-warn-soft px-3 py-1.5 text-xs text-warn-text">
          {fallbackReason}
        </div>
      )}

      {/* Main Letter Tiles */}
      <div className="my-3.5 flex flex-col items-center justify-center">
        <div
          className={`flex flex-wrap items-center justify-center ${sizing.gap}`}
          role="group"
          aria-label={`Word ${currentWord} at step ${activeStepIndex}`}
        >
          {currentWord.split('').map((char, idx) => {
            const isHighlighted = idx === highlightedIndex;
            const matchesTarget = idx < targetWord.length && char === targetWord[idx];

            return (
              <div key={idx} className="flex flex-col items-center gap-1">
                {!sizing.dense && (
                  <div className="h-4 flex items-center justify-center">
                    {isHighlighted && activeTransition ? (
                      <span
                        className={`font-mono text-[10px] font-semibold whitespace-nowrap ${
                          isArrivedChange ? 'text-accent-text' : 'text-warn-text'
                        }`}
                      >
                        {activeTransition.operation === 'insert'
                          ? `+${activeTransition.toChar}`
                          : activeTransition.operation === 'delete'
                          ? `-${activeTransition.fromChar}`
                          : `${activeTransition.fromChar}→${activeTransition.toChar}`}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-ink-subtle tabular-nums">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                )}

                <motion.div
                  key={`${activeStepIndex}-${idx}-${char}`}
                  initial={
                    isHighlighted && isArrivedChange
                      ? { scale: 0.9, opacity: 0.45 }
                      : { scale: 1, opacity: 1 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  title={`Position ${idx + 1}: ${char.toUpperCase()}`}
                  className={`flex ${sizing.box} items-center justify-center rounded-lg border font-mono ${sizing.text} font-semibold uppercase select-none transition-colors ${
                    isHighlighted
                      ? isArrivedChange
                        ? 'border-accent bg-accent-soft text-accent-text shadow-xs'
                        : 'border-warn-border bg-warn-soft text-warn-text'
                      : matchesTarget
                      ? 'border-good-border bg-good-soft text-ink'
                      : 'border-line bg-surface-alt text-ink'
                  }`}
                >
                  {char}
                </motion.div>

                {!sizing.dense && (
                  <span className="font-mono text-[10px] text-ink-subtle">
                    {isHighlighted
                      ? isArrivedChange
                        ? 'changed'
                        : 'next'
                      : idx < targetWord.length
                      ? matchesTarget
                        ? `=${targetWord[idx]}`
                        : `→${targetWord[idx]}`
                      : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Step Transition Summary */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-ink-muted">
          {prevStep ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-alt px-2.5 py-1 font-mono text-[11px]">
              <span className="text-ink-subtle max-w-[180px] truncate">{prevStep.fromWord}</span>
              <ArrowRight className="h-3 w-3 text-accent-text shrink-0" />
              <span className="font-semibold text-ink max-w-[180px] truncate">
                {prevStep.toWord}
              </span>
              <span aria-hidden="true" className="text-line">|</span>
              <span className="text-accent-text">
                p{prevStep.changedIndex + 1}: {prevStep.fromChar}→{prevStep.toChar}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-alt px-2.5 py-1 font-mono text-[11px]">
              <span className="font-semibold text-ink max-w-[220px] truncate">
                {currentWord}
              </span>
              <span aria-hidden="true" className="text-line">|</span>
              <span className="text-ink-muted">origin (0 edits)</span>
            </div>
          )}
        </div>
      </div>

      {/* Compact Playback Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset to first word"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-alt hover:text-ink transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectStep(Math.max(0, activeStepIndex - 1))}
            disabled={activeStepIndex === 0}
            aria-label="Previous step"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:bg-surface-alt hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-cta px-3.5 text-xs font-semibold text-cta-ink hover:bg-cta-hover transition-colors cursor-pointer min-w-[84px] justify-center"
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>{activeStepIndex >= path.length - 1 ? 'Replay' : 'Play'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectStep(Math.min(path.length - 1, activeStepIndex + 1))}
            disabled={activeStepIndex >= path.length - 1}
            aria-label="Next step"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:bg-surface-alt hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <label
            htmlFor="playback-speed"
            className="text-xs font-medium text-ink-muted font-mono tabular-nums whitespace-nowrap"
          >
            Speed: {speedMultiplier.toFixed(1)}x
          </label>
          <input
            id="playback-speed"
            type="range"
            min={0.5}
            max={2.5}
            step={0.5}
            value={speedMultiplier}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="w-24 accent-accent cursor-pointer"
          />
        </div>
      </div>
    </section>
  );
}
