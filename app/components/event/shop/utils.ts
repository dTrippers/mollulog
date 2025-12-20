/**
 * Formats resource count labels with K/M suffixes for large numbers.
 * Shared utility used across multiple shop components.
 */
export function resourceCountLabel(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toLocaleString()}M`;
  }
  if (count >= 10000) {
    return `${(count / 1000).toLocaleString()}K`;
  }
  return count.toLocaleString();
}
