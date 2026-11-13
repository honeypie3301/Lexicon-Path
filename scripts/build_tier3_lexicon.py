#!/usr/bin/env python3
"""
Concurrently fetches open-license English dictionaries/wordlists, deduplicates
valid alphabetic words (2..64 chars), subtracts the bundled Tier 2 275k base
lexicon, and writes length-sharded files into public/lexicon/.
"""

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
BASE_JSON = ROOT / "node_modules" / "an-array-of-english-words" / "index.json"
OUT_DIR = ROOT / "public" / "lexicon"
ALPHA_RE = re.compile(r"^[a-z]{2,64}$")

SOURCES = [
    ("txt", "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"),
    ("quoted", "https://raw.githubusercontent.com/wordnik/wordlist/main/wordlist-20210729.txt"),
    ("txt", "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt"),
    ("txt", "https://raw.githubusercontent.com/jesstess/Scrabble/master/scrabble/sowpods.txt"),
    ("txt", "https://raw.githubusercontent.com/redbo/scrabble/master/dictionary.txt"),
    ("txt", "https://raw.githubusercontent.com/lorenbrichter/Words/master/Words/en.txt"),
    ("txt", "https://raw.githubusercontent.com/sindresorhus/word-list/main/words.txt"),
    ("txt", "https://raw.githubusercontent.com/kkrypt0nn/wordlists/main/wordlists/languages/english.txt"),
    ("ipa", "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt"),
    ("ipa", "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt"),
    ("dic", "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/en_US.dic"),
    ("dic", "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/en_GB.dic"),
    ("json", "https://raw.githubusercontent.com/matthewreagan/WebstersEnglishDictionary/master/dictionary.json"),
    ("json", "https://raw.githubusercontent.com/adambom/dictionary/master/dictionary.json"),
    ("freq", "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt"),
]


def fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "LexiconPathBuilder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "ignore")


def load_source(item: tuple[str, str]) -> tuple[str, set[str]]:
    kind, url = item
    raw = fetch_text(url)
    words: set[str] = set()

    if kind == "txt":
        for line in raw.splitlines():
            w = line.strip().lower()
            if ALPHA_RE.match(w):
                words.add(w)
    elif kind == "quoted":
        for line in raw.splitlines():
            w = line.strip().strip('"').lower()
            if ALPHA_RE.match(w):
                words.add(w)
    elif kind == "ipa":
        for line in raw.splitlines():
            w = line.split("\t", 1)[0].strip().lower()
            if ALPHA_RE.match(w):
                words.add(w)
    elif kind == "dic":
        for line in raw.splitlines()[1:]:
            w = line.split("/", 1)[0].strip().lower()
            if ALPHA_RE.match(w):
                words.add(w)
    elif kind == "json":
        data = json.loads(raw)
        for k in data.keys():
            w = k.strip().lower()
            if ALPHA_RE.match(w):
                words.add(w)
    elif kind == "freq":
        for line in raw.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit() and int(parts[1]) >= 5:
                w = parts[0].strip().lower()
                if ALPHA_RE.match(w):
                    words.add(w)

    return url.rsplit("/", 1)[-1], words


def main() -> None:
    t0 = time.time()
    with BASE_JSON.open("r", encoding="utf-8") as f:
        base_words = {w for w in json.load(f) if ALPHA_RE.match(w)}

    merged: set[str] = set()
    with ThreadPoolExecutor(max_workers=8) as pool:
        for name, ws in pool.map(load_source, SOURCES):
            print(f"Loaded {name}: {len(ws):,} words")
            merged |= ws

    delta_words = merged - base_words
    by_length: dict[int, list[str]] = defaultdict(list)
    for w in delta_words:
        by_length[len(w)].append(w)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for existing in OUT_DIR.glob("len-*.txt"):
        existing.unlink()

    lengths_meta: dict[str, int] = {}
    for length in sorted(by_length.keys()):
        bucket = sorted(by_length[length])
        lengths_meta[str(length)] = len(bucket)
        (OUT_DIR / f"len-{length}.txt").write_text("\n".join(bucket) + "\n", encoding="utf-8")

    manifest = {
        "totalBaseWords": len(base_words),
        "totalTier3DeltaWords": len(delta_words),
        "totalCombinedWords": len(base_words | merged),
        "lengths": lengths_meta,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(
        f"Built {len(lengths_meta)} length shards: "
        f"{manifest['totalCombinedWords']:,} total words "
        f"({manifest['totalTier3DeltaWords']:,} Tier 3 delta) in {time.time() - t0:.2f}s"
    )


if __name__ == "__main__":
    main()
