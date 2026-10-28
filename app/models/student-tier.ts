const maximumTiers: Record<string, number> = {
  "2025-12-22": 9,
};

export function getMaxTierAt(date: Date | string): number {
  const targetDate = date instanceof Date ? date : new Date(date);
  const dates = Object.keys(maximumTiers).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (targetDate >= new Date(dates[i])) {
      return maximumTiers[dates[i]];
    }
  }
  return 8;
}
