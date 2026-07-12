import { Link } from "react-router";
import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { HeartIcon as HeartIconOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";
import { StudentCard } from "~/components/features/students";
import { AttributeBadge } from "~/components/primitives";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  recruitmentLabelLocale,
  roleColor,
  roleLocale,
} from "~/locales/ko";
import type { Role } from "~/models/content.d";
import { cn } from "~/lib/utils";
import { useSignIn } from "~/contexts/SignInProvider";
import type { RecruitmentTypeEnum, Attack, Defense } from "~/graphql/graphql";

type EventRecruitmentProps = {
  recruitment: {
    recruitmentType: RecruitmentTypeEnum;
    rerun: boolean;
    since: Date | null;
    until: Date | null;
    student: {
      uid: string;
      attackType: Attack;
      defenseType: Defense;
      role: Role;
    } | null;
    studentName: string;
  };

  favoritedCount: number;
  favorited: boolean;
  onFavorite: (favorited: boolean) => void;

  signedIn: boolean;
};

export default function EventRecruitment({
  recruitment,
  favoritedCount,
  favorited,
  onFavorite,
  signedIn,
}: EventRecruitmentProps) {
  const studentUid = recruitment.student?.uid ?? null;
  const { attackType, defenseType, role } = recruitment.student ?? {};

  const { showSignIn } = useSignIn();

  return (
    <div className="relative my-4 p-2 flex flex-col md:flex-row bg-neutral-100 dark:bg-neutral-900 rounded-lg">
      <div className="flex items-center grow">
        <div className="w-12 md:w-16 mx-1 md:mx-2">
          <StudentCard uid={studentUid} />
        </div>
        <div className="px-2 grow">
          <div className="pt-2">
            <p className="text-xs text-neutral-500">{recruitmentLabelLocale(recruitment)}</p>
            <Link to={`/students/${studentUid}`} className="flex items-center hover:underline">
              <span className="font-semibold">{recruitment.studentName}</span>
              {studentUid && <ChevronRightIcon className="ml-1 size-4 inline" />}
            </Link>
          </div>
          {attackType && defenseType && role && (
            <div className="py-1 flex text-sm gap-x-1 tracking-tighter md:tracking-normal">
              <AttributeBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
              <AttributeBadge text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} />
              <AttributeBadge text={roleLocale[role]} color={roleColor[role]} />
            </div>
          )}
        </div>
      </div>
      {studentUid && (
        <div className="absolute right-4 top-4 md:top-0 h-full flex items-start md:items-center justify-end">
          <button
            type="button"
            className={cn(
              `group inline-flex items-center gap-2 px-4 py-1 md:py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer ${
                favorited
                  ? "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40"
                  : "bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 shadow-lg shadow-neutral-200/50 dark:shadow-neutral-700/50 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              }`,
            )}
            onClick={() => (signedIn ? onFavorite(!favorited) : showSignIn())}
          >
            {favorited ? (
              <HeartIconSolid className="size-4" />
            ) : (
              <HeartIconOutline className="size-4" strokeWidth={2} />
            )}
            <span className="font-semibold">{favoritedCount}</span>
          </button>
        </div>
      )}
    </div>
  );
}
