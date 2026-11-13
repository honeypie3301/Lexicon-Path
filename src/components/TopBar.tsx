import { Shuffle } from 'lucide-react';

interface TopBarProps {
  onTryAnotherPair: () => void;
}

export function TopBar({ onTryAnotherPair }: TopBarProps) {
  return (
    <header className="border-b border-line bg-surface transition-colors">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-3">
        <a
          href="#top"
          className="font-display text-lg font-bold tracking-tight text-ink whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
        >
          Lexicon Path
        </a>

        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-ink-muted"
        >
          <a
            href="#transformation-stage"
            className="hover:text-ink hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Transformation
          </a>
          <a
            href="#step-sequence"
            className="hover:text-ink hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Step Sequence
          </a>
          <a
            href="#graph-process"
            className="hover:text-ink hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Graph Search
          </a>
          <a
            href="#step-validator"
            className="hover:text-ink hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Validator
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onTryAnotherPair}
            title="Pick a random reachable pair of English words"
            className="inline-flex items-center gap-1.5 rounded-lg bg-cta px-3.5 py-1.5 text-xs font-semibold text-cta-ink hover:bg-cta-hover transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 cursor-pointer"
          >
            <Shuffle className="h-3.5 w-3.5" />
            <span>Try Another Pair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
