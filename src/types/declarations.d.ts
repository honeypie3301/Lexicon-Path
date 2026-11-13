declare module 'an-array-of-english-words' {
  const words: string[];
  export default words;
}

declare module 'popular-english-words' {
  export const words: {
    getMostPopular: (count?: number) => string[];
    getMostPopularLength: (count?: number, length?: number) => string[];
    getWordRank: (word: string) => number;
  };
}
