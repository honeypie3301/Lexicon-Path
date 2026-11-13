import type { TransitionStep, ValidationReport } from '../types/wordGraph';

export function computeHammingDistance(a: string, b: string): {
  distance: number;
  changedIndex: number;
} {
  if (a.length !== b.length) {
    return { distance: -1, changedIndex: -1 };
  }
  let distance = 0;
  let changedIndex = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      distance++;
      if (changedIndex === -1) {
        changedIndex = i;
      }
    }
  }
  return { distance, changedIndex };
}

export function computeEditDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1];
      } else {
        cur[j] = 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      }
    }
    prev = cur;
  }
  return prev[n];
}

export function computeSameLengthSubstitutePath(start: string, target: string): {
  path: string[];
  steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }>;
} {
  const path: string[] = [start];
  const steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }> = [];

  let current = start;
  for (let i = 0; i < start.length; i++) {
    if (current[i] === target[i]) continue;
    const nextWord = current.slice(0, i) + target[i] + current.slice(i + 1);
    steps.push({
      fromWord: current,
      toWord: nextWord,
      operation: 'substitute',
      changedIndex: i,
      fromChar: current[i],
      toChar: target[i],
    });
    current = nextWord;
    path.push(nextWord);
  }

  return { path, steps };
}

export function computeSingleEditPath(start: string, target: string): {
  path: string[];
  steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }>;
} {
  const m = start.length;
  const n = target.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (start[i - 1] === target[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 +
          Math.min(
            dp[i - 1][j - 1], // substitute
            dp[i - 1][j],     // delete
            dp[i][j - 1]      // insert
          );
      }
    }
  }

  type Op =
    | { type: 'match'; ch: string }
    | { type: 'substitute'; fromChar: string; toChar: string }
    | { type: 'delete'; fromChar: string }
    | { type: 'insert'; toChar: string };

  const ops: Op[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && start[i - 1] === target[j - 1]) {
      ops.push({ type: 'match', ch: start[i - 1] });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ type: 'substitute', fromChar: start[i - 1], toChar: target[j - 1] });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: 'delete', fromChar: start[i - 1] });
      i--;
    } else {
      ops.push({ type: 'insert', toChar: target[j - 1] });
      j--;
    }
  }

  ops.reverse();

  let current = start;
  let cursor = 0;
  const path: string[] = [start];
  const steps: Array<{
    fromWord: string;
    toWord: string;
    operation: 'substitute' | 'insert' | 'delete';
    changedIndex: number;
    fromChar: string;
    toChar: string;
  }> = [];

  for (const op of ops) {
    if (op.type === 'match') {
      cursor++;
      continue;
    }

    const fromWord = current;
    if (op.type === 'substitute') {
      const toWord =
        current.slice(0, cursor) + op.toChar + current.slice(cursor + 1);
      steps.push({
        fromWord,
        toWord,
        operation: 'substitute',
        changedIndex: cursor,
        fromChar: op.fromChar,
        toChar: op.toChar,
      });
      current = toWord;
      path.push(toWord);
      cursor++;
    } else if (op.type === 'delete') {
      const toWord = current.slice(0, cursor) + current.slice(cursor + 1);
      steps.push({
        fromWord,
        toWord,
        operation: 'delete',
        changedIndex: cursor,
        fromChar: op.fromChar,
        toChar: '∅',
      });
      current = toWord;
      path.push(toWord);
    } else {
      const toWord =
        current.slice(0, cursor) + op.toChar + current.slice(cursor);
      steps.push({
        fromWord,
        toWord,
        operation: 'insert',
        changedIndex: cursor,
        fromChar: '∅',
        toChar: op.toChar,
      });
      current = toWord;
      path.push(toWord);
      cursor++;
    }
  }

  return { path, steps };
}

export function detectSingleEdit(
  fromWord: string,
  toWord: string
): {
  valid: boolean;
  operation: 'substitute' | 'insert' | 'delete';
  changedIndex: number;
  fromChar: string;
  toChar: string;
  editDistance: number;
} {
  if (fromWord.length === toWord.length) {
    const { distance, changedIndex } = computeHammingDistance(fromWord, toWord);
    return {
      valid: distance === 1 && changedIndex >= 0,
      operation: 'substitute',
      changedIndex,
      fromChar: changedIndex >= 0 ? fromWord[changedIndex] : '',
      toChar: changedIndex >= 0 ? toWord[changedIndex] : '',
      editDistance: distance,
    };
  }

  if (toWord.length === fromWord.length + 1) {
    let i = 0;
    while (i < fromWord.length && fromWord[i] === toWord[i]) i++;
    const matches =
      fromWord.slice(0, i) + toWord[i] + fromWord.slice(i) === toWord;
    return {
      valid: matches,
      operation: 'insert',
      changedIndex: matches ? i : -1,
      fromChar: '∅',
      toChar: matches ? toWord[i] : '',
      editDistance: matches ? 1 : computeEditDistance(fromWord, toWord),
    };
  }

  if (fromWord.length === toWord.length + 1) {
    let i = 0;
    while (i < toWord.length && fromWord[i] === toWord[i]) i++;
    const matches =
      fromWord.slice(0, i) + fromWord.slice(i + 1) === toWord;
    return {
      valid: matches,
      operation: 'delete',
      changedIndex: matches ? i : -1,
      fromChar: matches ? fromWord[i] : '',
      toChar: '∅',
      editDistance: matches ? 1 : computeEditDistance(fromWord, toWord),
    };
  }

  return {
    valid: false,
    operation: 'substitute',
    changedIndex: -1,
    fromChar: '',
    toChar: '',
    editDistance: computeEditDistance(fromWord, toWord),
  };
}

export function validateTransformationChain(
  path: string[],
  startWord: string,
  targetWord: string,
  dictionarySet: { has(word: string): boolean },
  allowInsertDelete = false
): ValidationReport {
  const errorMessages: string[] = [];

  if (path.length === 0) {
    return {
      isValid: false,
      allSameLength: false,
      allSingleLetter: false,
      allInDictionary: false,
      endpointsMatch: false,
      stepChecks: [],
      errorMessages: ['Transformation path is empty.'],
    };
  }

  const expectedLength = startWord.length;
  const endpointsMatch =
    path[0] === startWord && path[path.length - 1] === targetWord;
  if (!endpointsMatch) {
    errorMessages.push(
      `Endpoints mismatch: expected "${startWord}" -> "${targetWord}", got "${path[0]}" -> "${path[path.length - 1]}".`
    );
  }

  const allSameLength = path.every((w) => w.length === expectedLength);
  if (!allowInsertDelete && !allSameLength) {
    errorMessages.push('All words in the chain must have identical character length.');
  }

  let allInDictionary = true;
  for (let i = 0; i < path.length; i++) {
    if (!dictionarySet.has(path[i])) {
      allInDictionary = false;
      errorMessages.push(`Word "${path[i]}" at step ${i} is not a verified English dictionary word.`);
    }
  }

  const stepChecks: TransitionStep[] = [];
  let allSingleLetter = true;

  for (let i = 0; i < path.length - 1; i++) {
    const fromWord = path[i];
    const toWord = path[i + 1];
    const isValidLength = allowInsertDelete
      ? Math.abs(fromWord.length - toWord.length) <= 1
      : fromWord.length === toWord.length;
    const detected = detectSingleEdit(fromWord, toWord);
    const isSingleLetterChange =
      detected.valid &&
      (allowInsertDelete || detected.operation === 'substitute');

    if (!isSingleLetterChange) {
      allSingleLetter = false;
      errorMessages.push(
        `Step ${i + 1} ("${fromWord}" -> "${toWord}") has edit distance ${detected.editDistance}, expected 1.`
      );
    }

    stepChecks.push({
      stepNumber: i + 1,
      fromWord,
      toWord,
      operation: detected.operation,
      changedIndex: detected.changedIndex,
      fromChar: detected.fromChar,
      toChar: detected.toChar,
      editDistance: detected.editDistance,
      isValidLength,
      isSingleLetterChange,
      isInDictionary: dictionarySet.has(toWord),
    });
  }

  const isValid =
    endpointsMatch &&
    (allowInsertDelete || allSameLength) &&
    allSingleLetter &&
    allInDictionary;

  return {
    isValid,
    allSameLength,
    allSingleLetter,
    allInDictionary,
    endpointsMatch,
    stepChecks,
    errorMessages,
  };
}
