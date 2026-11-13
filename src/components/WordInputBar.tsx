import { ArrowLeftRight, ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { AlgorithmId, LexiconMode, UiDesignId } from '../types/wordGraph';

export interface ExamplePair {
  start: string;
  target: string;
  label?: string;
  recommendedLexicon?: LexiconMode;
  recommendedInsertDelete?: boolean;
}

export const EXAMPLE_PAIRS: ExamplePair[] = [
  { start: 'fish', target: 'boat', recommendedLexicon: 'common', recommendedInsertDelete: false },
  { start: 'cold', target: 'warm', recommendedLexicon: 'common', recommendedInsertDelete: false },
  { start: 'winter', target: 'summer', recommendedLexicon: 'extended', recommendedInsertDelete: false },
  { start: 'running', target: 'jumping', recommendedLexicon: 'extended', recommendedInsertDelete: false },
  { start: 'plan', target: 'planet', recommendedLexicon: 'common', recommendedInsertDelete: true },
  {
    start: 'floccinaucinihilipilification',
    target: 'trinitrophenylmethylnitramine',
    label: '29-letter pair',
    recommendedLexicon: 'extended',
    recommendedInsertDelete: false,
  },
];

export const UI_DESIGNS: Array<{
  id: UiDesignId;
  label: string;
  swatchBg: string;
  swatchAccent: string;
}> = [
  { id: 'archival', label: 'Warm Archival', swatchBg: '#f9f6f0', swatchAccent: '#b45309' },
  { id: 'editorial', label: 'Editorial Paper', swatchBg: '#f8fafc', swatchAccent: '#0284c7' },
  { id: 'blueprint', label: 'Blueprint Slate', swatchBg: '#0b1120', swatchAccent: '#38bdf8' },
  { id: 'terminal', label: 'Terminal Mono', swatchBg: '#09090b', swatchAccent: '#10b981' },
];

interface WordInputBarProps {
  startInput: string;
  targetInput: string;
  algorithm: AlgorithmId;
  lexiconMode: LexiconMode;
  allowInsertDelete: boolean;
  strictDictionaryOnly: boolean;
  uiDesign: UiDesignId;
  isSearching: boolean;
  onStartChange: (val: string) => void;
  onTargetChange: (val: string) => void;
  onSwap: () => void;
  onSubmit: () => void;
  onSelectExample: (pair: ExamplePair) => void;
  onAlgorithmChange: (algo: AlgorithmId) => void;
  onLexiconChange: (mode: LexiconMode) => void;
  onToggleInsertDelete: (allow: boolean) => void;
  onToggleStrictDictionary: (strict: boolean) => void;
  onUiDesignChange: (design: UiDesignId) => void;
}

export function WordInputBar({
  startInput,
  targetInput,
  algorithm,
  lexiconMode,
  allowInsertDelete,
  strictDictionaryOnly,
  uiDesign,
  isSearching,
  onStartChange,
  onTargetChange,
  onSwap,
  onSubmit,
  onSelectExample,
  onAlgorithmChange,
  onLexiconChange,
  onToggleInsertDelete,
  onToggleStrictDictionary,
  onUiDesignChange,
}: WordInputBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [settingsOpen]);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const lengthsDiffer =
    startInput.trim().length > 0 &&
    targetInput.trim().length > 0 &&
    startInput.trim().length !== targetInput.trim().length;

  return (
    <section
      aria-label="Word transformation inputs"
      className="rounded-xl border border-line bg-surface p-4 transition-colors"
    >
      <form onSubmit={handleFormSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-end">
          <div>
            <label
              htmlFor="start-word-input"
              className="mb-1 flex items-center justify-between text-xs font-medium text-ink-muted"
            >
              <span>Start Word</span>
              <span className="font-mono tabular-nums text-ink-subtle">
                {startInput.trim().length} letters
              </span>
            </label>
            <input
              id="start-word-input"
              type="text"
              value={startInput}
              onChange={(e) => onStartChange(e.target.value.replace(/[^a-zA-Z]/g, ''))}
              placeholder="fish"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-surface-alt px-3 py-2 font-mono text-sm font-semibold tracking-wide text-ink lowercase placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>

          <div className="flex justify-center lg:pb-0.5">
            <button
              type="button"
              onClick={onSwap}
              aria-label="Swap start and target words"
              title="Swap start and target words"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted hover:bg-surface-alt hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label
              htmlFor="target-word-input"
              className="mb-1 flex items-center justify-between text-xs font-medium text-ink-muted"
            >
              <span>Target Word</span>
              <span
                className={`font-mono tabular-nums ${
                  lengthsDiffer && !allowInsertDelete && strictDictionaryOnly
                    ? 'font-semibold text-warn-text'
                    : 'text-ink-subtle'
                }`}
              >
                {targetInput.trim().length} letters
              </span>
            </label>
            <input
              id="target-word-input"
              type="text"
              value={targetInput}
              onChange={(e) => onTargetChange(e.target.value.replace(/[^a-zA-Z]/g, ''))}
              placeholder="boat"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-surface-alt px-3 py-2 font-mono text-sm font-semibold tracking-wide text-ink lowercase placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </div>

          <button
            type="submit"
            disabled={isSearching || !startInput.trim() || !targetInput.trim()}
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{isSearching ? 'Tracing...' : 'Trace Path'}</span>
          </button>
        </div>

        {/* Clean Bottom Row: Examples + Advanced Settings Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-subtle">Examples:</span>
            {EXAMPLE_PAIRS.map((pair, idx) => {
              const isActive =
                startInput.trim().toLowerCase() === pair.start &&
                targetInput.trim().toLowerCase() === pair.target;
              return (
                <span key={`${pair.start}-${pair.target}`} className="inline-flex items-center gap-2">
                  {idx > 0 && (
                    <span aria-hidden="true" className="text-line">
                      /
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectExample(pair)}
                    className={`font-mono text-xs transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'font-semibold text-accent-text underline underline-offset-4'
                        : 'text-ink-muted hover:text-ink hover:underline underline-offset-4'
                    }`}
                  >
                    {pair.label ?? `${pair.start}→${pair.target}`}
                  </button>
                </span>
              );
            })}
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-expanded={settingsOpen}
              aria-haspopup="true"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-alt px-2.5 text-xs font-medium text-ink hover:bg-surface transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted" />
              <span>Settings</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-ink-subtle transition-transform duration-150 ${
                  settingsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {settingsOpen && (
              <div
                role="dialog"
                aria-label="Advanced settings and UI design"
                className="absolute right-0 z-30 mt-2 w-[320px] sm:w-[360px] rounded-xl border border-line bg-surface p-4 shadow-lg space-y-3.5"
              >
                {/* UI Design */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-ink">UI Design</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {UI_DESIGNS.map((design) => {
                      const selected = uiDesign === design.id;
                      return (
                        <button
                          key={design.id}
                          type="button"
                          onClick={() => onUiDesignChange(design.id)}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors text-left cursor-pointer ${
                            selected
                              ? 'border-accent bg-accent-soft text-accent-text'
                              : 'border-line bg-surface-alt text-ink-muted hover:text-ink'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="inline-flex h-3.5 w-3.5 shrink-0 rounded-xs border border-line overflow-hidden"
                          >
                            <span className="w-1/2 h-full" style={{ backgroundColor: design.swatchBg }} />
                            <span className="w-1/2 h-full" style={{ backgroundColor: design.swatchAccent }} />
                          </span>
                          <span className="truncate">{design.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Search Algorithm */}
                <div className="space-y-1.5 border-t border-line-soft pt-3">
                  <div className="text-xs font-semibold text-ink">Graph Algorithm</div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-alt p-1">
                    {(
                      [
                        { id: 'bidirectional-bfs', label: 'Bidir BFS' },
                        { id: 'astar-hamming', label: 'A* Search' },
                        { id: 'standard-bfs', label: 'Standard' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onAlgorithmChange(item.id)}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          algorithm === item.id
                            ? 'bg-surface text-ink shadow-xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dictionary Scope */}
                <div className="space-y-1.5 border-t border-line-soft pt-3">
                  <div className="text-xs font-semibold text-ink">Preferred Lexicon</div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-alt p-1">
                    {(
                      [
                        { id: 'common', label: 'Common' },
                        { id: 'extended', label: '275k' },
                        { id: 'mega', label: '700k+' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onLexiconChange(item.id)}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          lexiconMode === item.id
                            ? 'bg-surface text-ink shadow-xs'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rules */}
                <div className="space-y-2.5 border-t border-line-soft pt-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowInsertDelete}
                      onChange={(e) => onToggleInsertDelete(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-line accent-accent"
                    />
                    <span className="text-xs leading-snug text-ink-muted">
                      <span className="block font-semibold text-ink">
                        Allow adding or removing 1 letter
                      </span>
                      Bridges different-length words through real English words.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={strictDictionaryOnly}
                      onChange={(e) => onToggleStrictDictionary(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-line accent-accent"
                    />
                    <span className="text-xs leading-snug text-ink-muted">
                      <span className="block font-semibold text-ink">
                        Strict dictionary-only mode
                      </span>
                      Disables single-letter fallback when isolated long words have no dictionary bridge.
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
