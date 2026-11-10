// How a trailing digit is read in Korean (일, 이, 삼, …): whether it ends with a final consonant, and whether that
// consonant is ㄹ.
const DIGIT_ENDINGS: Record<string, { final: boolean; rieul: boolean }> = {
  "0": { final: true, rieul: false },
  "1": { final: true, rieul: true },
  "2": { final: false, rieul: false },
  "3": { final: true, rieul: false },
  "4": { final: false, rieul: false },
  "5": { final: false, rieul: false },
  "6": { final: true, rieul: false },
  "7": { final: true, rieul: true },
  "8": { final: true, rieul: true },
  "9": { final: false, rieul: false },
};

// The word a particle attaches to: a variant in parentheses ("카린(바니걸)") does not change it.
function particleBase(word: string): string {
  return word
    .trim()
    .replace(/\([^()]*\)$/, "")
    .trim();
}

function finalSound(word: string): { final: boolean; rieul: boolean } | null {
  const last = particleBase(word).at(-1);
  if (!last) return null;
  const digit = DIGIT_ENDINGS[last];
  if (digit) return digit;
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return { final: code % 28 !== 0, rieul: code % 28 === 8 };
}

// Whether the last syllable of a word has a final consonant (받침). Returns null for a non-Hangul last character.
function hasFinalConsonant(word: string): boolean | null {
  return finalSound(word)?.final ?? null;
}

// The particle 으로/로 that matches the word's last sound ("★3으로", "★2로"). A final ㄹ takes 로.
export function withDirectionParticle(word: string): string {
  if (!word.trim()) return word;
  const sound = finalSound(word);
  return `${word}${sound?.final && !sound.rieul ? "으로" : "로"}`;
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
