import { difficultyLocale } from "~/locales/ko";

type RaidDifficultyComparisonProps = {
  currentClearLevels: Record<string, number>;
  fromClearLevels: Record<string, number>;
};

// Difficulty order from highest to lowest
const DIFFICULTY_ORDER: string[] = [
  "lunatic",
  "torment",
  "insane",
  "extreme",
  "hardcore",
  "veryhard",
  "hard",
  "normal",
];

export default function RaidDifficultyComparison({
  currentClearLevels,
  fromClearLevels,
}: RaidDifficultyComparisonProps) {
  // Calculate totals
  const currentTotal = Object.values(currentClearLevels).reduce((sum, count) => sum + count, 0);
  const fromTotal = Object.values(fromClearLevels).reduce((sum, count) => sum + count, 0);

  if (currentTotal === 0 || fromTotal === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        비교할 데이터가 없어요
      </div>
    );
  }

  // Get all difficulties that appear in either dataset
  const allDifficulties = new Set([
    ...Object.keys(currentClearLevels),
    ...Object.keys(fromClearLevels),
  ]);

  // Sort by difficulty order, filter, and exclude those with no change
  const sortedDifficulties = DIFFICULTY_ORDER.filter((difficulty) => {
    if (!allDifficulties.has(difficulty)) {
      return false;
    }
    const currentCount = currentClearLevels[difficulty] || 0;
    const fromCount = fromClearLevels[difficulty] || 0;
    const currentPercentage = currentTotal > 0 ? Math.round((currentCount / currentTotal) * 100) : 0;
    const fromPercentage = fromTotal > 0 ? Math.round((fromCount / fromTotal) * 100) : 0;
    return currentPercentage !== fromPercentage; // Only show if there's a change
  });

  if (sortedDifficulties.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        클리어 비율에 변화가 없어요
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800/50">
      <div className="space-y-3">
        {sortedDifficulties.map((difficulty) => {
          const currentCount = currentClearLevels[difficulty] || 0;
          const fromCount = fromClearLevels[difficulty] || 0;
          const currentPercentage = currentTotal > 0 ? Math.round((currentCount / currentTotal) * 100) : 0;
          const fromPercentage = fromTotal > 0 ? Math.round((fromCount / fromTotal) * 100) : 0;
          const percentageDiff = currentPercentage - fromPercentage;
          const countDiff = currentCount - fromCount;

          return (
            <div key={difficulty} className="flex items-center gap-2">
              {/* Label */}
              <div className="flex-shrink-0 w-40">
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {difficultyLocale[difficulty] || difficulty}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {fromPercentage}% → {currentPercentage}%
                  {percentageDiff !== 0 && (
                    <span className={`ml-1 ${percentageDiff > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      ({percentageDiff > 0 ? "+" : ""}{percentageDiff}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Bar */}
              <div className="flex-1 min-w-0">
                <div className="bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 relative">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 absolute left-0 top-0 ${
                      percentageDiff > 0
                        ? "bg-green-500 dark:bg-green-400"
                        : percentageDiff < 0
                        ? "bg-red-500 dark:bg-red-400"
                        : "bg-blue-500 dark:bg-blue-400"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, currentPercentage))}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

