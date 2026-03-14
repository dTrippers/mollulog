import { Link } from "react-router";
import { TagIcon } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";

type StudentGradingChartProps = {
  student: { uid: string; name: string };
  tagCounts: Array<{ tag: StudentGradingTagValue; displayName: string; count: number }>;
  noGrading: boolean;
  signedIn: boolean;
};

export default function StudentGradingChart({ student, tagCounts, noGrading, signedIn }: StudentGradingChartProps) {
  const { showSignIn } = useSignIn();
  const maxCount = Math.max(...tagCounts.map((tagCount) => tagCount.count), 1);

  const noGradingView = (
    <div className="mb-4 p-4 text-center text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 bg-neutral-100 dark:bg-neutral-900 transition rounded-lg cursor-pointer">
      <p className="text-sm">아직 평가가 없어요</p>
      <p className="text-xs mt-1 text-blue-600 dark:text-blue-400 group-hover:underline">
        {signedIn ? "첫 번째 평가를 작성해보세요!" : "로그인 후 첫 번째 평가를 작성해보세요!"}
      </p>
    </div>
  );

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 bg-white dark:bg-neutral-800/50">
      <div className="space-y-3">
        {noGrading && (
          signedIn ?
            <Link to={`/students/${student.uid}/grade`} className="group">
              {noGradingView}
            </Link> :
            <button type="button" className="w-full text-left" onClick={() => showSignIn()}>
              {noGradingView}
            </button>
        )}

        {tagCounts.map(({ tag, displayName, count }) => (
          <div key={tag} className="flex items-center gap-2">
            <div className="flex-shrink-0">
              <TagIcon tag={tag} />
            </div>
            <div className="flex-shrink-0 w-32">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {displayName}
              </span>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 relative">
                <div
                  className="bg-neutral-700 dark:bg-neutral-50 h-2 rounded-full transition-all duration-300 absolute left-0 top-0 min-w-0"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="ml-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 min-w-0 flex-shrink-0">
                {count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
