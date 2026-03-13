import { difficultyLocale } from "~/locales/ko";

type RaidClearLevelsProps = {
  clearLevels: Record<string, number>;
};

// Difficulty order from highest to lowest
const DIFFICULTY_ORDER: string[] = [
  "lunatic",
  "torment",
  "insane",
  "extreme",
  "hardcore",
  "very_hard",
  "hard",
  "normal",
];

export default function RaidClearLevels({ clearLevels }: RaidClearLevelsProps) {
  // Calculate total count
  const totalCount = Object.values(clearLevels).reduce((sum, count) => sum + count, 0);

  if (totalCount === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
        클리어 난이도 데이터가 없어요
      </div>
    );
  }

  // Sort difficulties by order and filter out zero counts
  const sortedDifficulties = DIFFICULTY_ORDER.filter(
    (difficulty) => clearLevels[difficulty] && clearLevels[difficulty] > 0
  );

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800/50">
      <div className="space-y-3">
        {sortedDifficulties.map((difficulty) => {
          const count = clearLevels[difficulty];
          const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
          const barWidth = totalCount > 0 ? (count / totalCount) * 100 : 0;

          return (
            <div key={difficulty} className="flex items-center gap-2">
              {/* Label with count and percentage */}
              <div className="flex-shrink-0 w-40">
                <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {difficultyLocale[difficulty] || difficulty}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {count.toLocaleString()}회 ({percentage}%)
                </div>
              </div>

              {/* Bar */}
              <div className="flex-1 min-w-0">
                <div className="bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 relative">
                  <div
                    className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-300 absolute left-0 top-0"
                    style={{ width: `${barWidth}%` }}
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

