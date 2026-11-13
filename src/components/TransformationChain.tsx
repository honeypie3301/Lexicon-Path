import { CheckCircle2 } from 'lucide-react';
import type { TransitionStep } from '../types/wordGraph';

interface TransformationChainProps {
  path: string[];
  steps: TransitionStep[];
  usedFallbackMorph: boolean;
  activeStepIndex: number;
  meetingWord: string | null;
  onSelectStep: (index: number) => void;
}

export function TransformationChain({
  path,
  steps,
  usedFallbackMorph,
  activeStepIndex,
  meetingWord,
  onSelectStep,
}: TransformationChainProps) {
  if (path.length === 0) return null;

  const maxLen = Math.max(...path.map((w) => w.length));
  const useInlineLetters = maxLen > 12;

  return (
    <section
      id="step-sequence"
      aria-label="Complete word transformation sequence"
      className="rounded-xl border border-line bg-surface p-4 transition-colors"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-2.5">
        <div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
            Transformation Sequence
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {usedFallbackMorph
              ? 'Each step mutates exactly one character. Select any step to inspect.'
              : 'Every word is a verified English word changing one letter. Click any row to jump.'}
          </p>
        </div>

        <span className="font-mono text-xs text-ink-subtle tabular-nums">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'} · {path.length} states
        </span>
      </div>

      <ol className="mt-2.5 max-h-[260px] overflow-y-auto divide-y divide-line-soft pr-1">
        {path.map((word, idx) => {
          const step = idx > 0 ? steps[idx - 1] : null;
          const isSelected = idx === activeStepIndex;
          const isBridge = meetingWord === word && idx > 0 && idx < path.length - 1;

          return (
            <li key={`${idx}-${word}`}>
              <button
                type="button"
                onClick={() => onSelectStep(idx)}
                className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-accent-soft ring-1 ring-inset ring-accent-border'
                    : 'hover:bg-surface-alt'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-5 shrink-0 font-mono text-[11px] tabular-nums ${
                      isSelected ? 'font-semibold text-accent-text' : 'text-ink-subtle'
                    }`}
                  >
                    {String(idx).padStart(2, '0')}
                  </span>

                  {useInlineLetters ? (
                    <div className="font-mono text-xs sm:text-sm font-semibold uppercase tracking-wide truncate">
                      {word.split('').map((ch, charIdx) => {
                        const isChanged =
                          step !== null &&
                          step.operation !== 'delete' &&
                          step.changedIndex === charIdx;
                        return (
                          <span
                            key={charIdx}
                            className={
                              isChanged
                                ? 'inline-block rounded bg-accent px-0.5 text-accent-ink'
                                : 'text-ink'
                            }
                          >
                            {ch}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1 font-mono text-xs font-semibold uppercase">
                      {word.split('').map((ch, charIdx) => {
                        const isChanged =
                          step !== null &&
                          step.operation !== 'delete' &&
                          step.changedIndex === charIdx;
                        return (
                          <span
                            key={charIdx}
                            className={`inline-flex h-6 w-5.5 items-center justify-center rounded border ${
                              isChanged
                                ? 'border-accent bg-accent text-accent-ink'
                                : isSelected
                                ? 'border-line bg-surface text-ink'
                                : 'border-line bg-surface-alt text-ink'
                            }`}
                          >
                            {ch}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-ink-subtle shrink-0">
                    {step ? (
                      <>
                        <span className="font-mono text-ink-muted">
                          {step.operation === 'insert'
                            ? `+${step.toChar}`
                            : step.operation === 'delete'
                            ? `-${step.fromChar}`
                            : `${step.fromChar}→${step.toChar}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          p{step.changedIndex + 1}
                        </span>
                        {isBridge && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-accent-text">
                              meet
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span>start</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                  {step ? (
                    <span className="inline-flex items-center gap-1 font-mono text-good-text tabular-nums">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {step.operation === 'substitute'
                          ? `Δ=${step.editDistance}`
                          : step.operation}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono text-ink-subtle">origin</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
