import { ClockIcon } from "@heroicons/react/24/solid";
import { raidTypeLocale } from "~/locales/ko";
import type { RaidType } from "~/models/content.d";

type RaidUnavailableStateProps = {
  raidType?: RaidType;
};

export default function RaidUnavailableState({ raidType }: RaidUnavailableStateProps) {
  return (
    <div className="my-16 md:my-48 w-full flex flex-col items-center justify-center">
      {raidType ? <ClockIcon className="my-2 w-16 h-16" strokeWidth={2} /> : null}
      <p className="my-2 text-2xl font-bold">
        {raidType ? `${raidTypeLocale[raidType]} 정보를 준비중이에요` : "정보를 준비중이에요"}
      </p>
      <p className="my-2 text-neutral-500 dark:text-neutral-400">
        정보가 준비된 컨텐츠를 선택하여 확인해보세요
      </p>
    </div>
  );
}
