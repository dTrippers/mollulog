import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import type { Attack, Defense } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import type { Role } from "~/models/content.d";
import { AttributeStripes } from "./AttributeStripes";
import { splitVisibleStudentName } from "./split-student-name";
import StudentPortrait from "./StudentPortrait";

export function RecruitmentStudentCard({
  studentUid,
  favoriteKey,
  studentName,
  label,
  attackType,
  defenseType,
  role,
  tone = "page",
  favorited,
  favoritedCount,
  signedIn,
  favoriteDisabled = false,
  onToggleFavorite,
}: {
  studentUid: string | null;
  favoriteKey: string | null;
  studentName: string;
  label: string;
  attackType?: Attack | null;
  defenseType?: Defense | null;
  role?: Role | null;
  tone?: "page" | "raised";
  favorited: boolean;
  favoritedCount: number | null;
  signedIn: boolean;
  favoriteDisabled?: boolean;
  onToggleFavorite: (favoriteKey: string, favorited: boolean) => void;
}) {
  const { showSignIn } = useSignIn();
  const [currentFavorited, setCurrentFavorited] = useState(favorited);
  const [currentCount, setCurrentCount] = useState(favoritedCount);
  const { name, variant } = splitVisibleStudentName(studentName);
  const controlSurface = tone === "raised" ? "bg-v2-surface" : "bg-v2-inset";

  useEffect(() => setCurrentFavorited(favorited), [favorited]);
  useEffect(() => setCurrentCount(favoritedCount), [favoritedCount]);

  return (
    <article
      className={cn(
        "flex w-28 shrink-0 flex-col overflow-hidden rounded-lg",
        tone === "raised" ? "bg-v2-inset" : "bg-v2-surface",
      )}
    >
      <div className="relative aspect-[200/226] w-full overflow-hidden bg-v2-inset">
        <StudentPortrait
          uid={studentUid ?? "unlisted"}
          alt={studentName}
          className="size-full object-cover object-top"
          haloScale="72%"
        />
        <span className="absolute top-0.5 right-0.5 rounded-md bg-v2-scrim px-1.5 py-0.5 text-xs leading-tight font-medium text-v2-on-media">
          {label}
        </span>
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-linear-to-t via-75% to-transparent px-2 pt-2",
            tone === "raised" ? "from-v2-inset via-v2-inset/75" : "from-v2-surface via-v2-surface/75",
          )}
        >
          {variant ? <p className="truncate text-xs leading-tight text-v2-fg-secondary">{variant}</p> : null}
          <p className="line-clamp-1 text-base leading-tight font-bold text-v2-fg">{name}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-1.5">
        {attackType && defenseType && role ? (
          <AttributeStripes attackType={attackType} defenseType={defenseType} role={role} compact />
        ) : null}

        {studentUid ? (
          <Link
            to={`/students/${studentUid}`}
            className={cn(
              "inline-flex min-h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-v2-fg-secondary hover:bg-v2-hover",
              controlSurface,
            )}
          >
            평가/통계
          </Link>
        ) : null}

        {favoriteKey ? (
          <button
            type="button"
            aria-label={currentCount === null ? "관심" : `관심 ${currentCount}명`}
            aria-pressed={currentFavorited}
            disabled={favoriteDisabled}
            className={cn(
              "inline-flex min-h-7 items-center justify-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-semibold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60",
              currentFavorited ? "bg-v2-danger text-v2-on-danger" : `${controlSurface} text-v2-fg-secondary`,
            )}
            onClick={() => {
              if (!signedIn) {
                showSignIn();
                return;
              }
              const nextFavorited = !currentFavorited;
              setCurrentFavorited(nextFavorited);
              setCurrentCount((count) => (count === null ? null : count + (nextFavorited ? 1 : -1)));
              onToggleFavorite(favoriteKey, nextFavorited);
            }}
          >
            {currentFavorited ? (
              <HeartSolidIcon className="size-3.5" aria-hidden="true" />
            ) : (
              <HeartOutlineIcon className="size-3.5" aria-hidden="true" />
            )}
            {currentCount === null ? null : <span className="tabular-nums">{currentCount}</span>}
          </button>
        ) : null}
      </div>
    </article>
  );
}
