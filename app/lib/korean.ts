// Whether the last syllable of a word has a final consonant (받침). Returns null for a non-Hangul last character.
function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().at(-1);
  if (!last) return null;
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return code % 28 !== 0;
}

// Appends the object particle 을/를 that matches the word's last syllable.
export function withObjectParticle(word: string): string {
  if (!word.trim()) return word;
  return `${word}${hasFinalConsonant(word) ? "을" : "를"}`;
}

// The conjunctive particle 과/와 that matches the word's last syllable.
export function conjunctionParticle(word: string): string {
  return hasFinalConsonant(word) ? "과" : "와";
}
