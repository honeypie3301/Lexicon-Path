# Lexicon Path

**Lexicon Path** is a curiosity-driven web application that shows how one English word turns into another **one letter at a time** (for example: `fish → fist → mist → most → moat → boat`). Rather than functioning as a puzzle or game, it lets you inspect the shortest transformation chain, see the exact letter changed at every step, and explore how graph search algorithms discover that path.

## What It Does

- **Single-Letter Pathfinding**: Finds the shortest valid transformation between two words (2 to 64 letters) and highlights the exact substituted, inserted, or deleted character at each step.
- **Multi-Algorithm Graph Search**: Runs **Bidirectional BFS**, **A\* Heuristic** (Hamming / Levenshtein), and **Standard BFS** inside a dedicated Web Worker so searches stay fast without blocking the UI.
- **Tiered English Lexicon & Smart Fallback**:
  1. Prioritizes ~32,000 common English words for clean, recognizable intermediate steps.
  2. Expands to ~275,000 English words when needed.
  3. Escalates to a **707,000+ word Tier 3 lexicon** stored as static length-sharded files (`public/lexicon/`) with IndexedDB caching—zero third-party API calls and zero rate limits.
  4. Bridges disconnected or unequal-length real words via a bounded 1-letter edit graph (`insert` / `delete` / `substitute`).
  5. Falls back to a bigram-guided, phonotactically scored single-letter transformation for isolated ultra-long words (unless **Strict dictionary-only mode** is enabled).
- **Live Search & Validation Views**:
  - **Transformation Stage**: Animated letter-tile playback with speed slider and keyboard controls (`←`, `→`, `Space`).
  - **Step Sequence**: Clickable list of every intermediate state with inline letter-change highlighting.
  - **Graph Search Explorer**: Inspects forward/backward frontier layers, the bidirectional meeting word, and 1-letter dictionary branches (click any neighbor to re-root the search).
  - **Telemetry, Comparison & Audit**: Tracks candidates checked, nodes visited/pruned, peak frontier, compute time, side-by-side efficiency bars with plain-English algorithm explanations, and a strict per-step validation audit.
- **Random Discovery & UI Themes**: **Try Another Pair** samples random reachable English pairs from the active dictionary, and **Settings** provides 5 themes (**Warm Archival** default, **Archival Dusk**, **Editorial Paper**, **Blueprint Slate**, and **Terminal Mono**) alongside algorithm and rule controls.

## Development

```bash
npm install --legacy-peer-deps
npm run dev
```

Run TypeScript checks and build static assets:

```bash
npm run lint
npm run build:static
```

## GitHub Pages Deployment

The repository includes `.github/workflows/deploy.yml`, `public/.nojekyll`, and relative asset bundling (`base: './'` in `vite.config.ts`). Push to `main` or `master` and set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
