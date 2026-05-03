import dayjs from "dayjs";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import PyroxeneTimelineResources from "./PyroxeneTimelineResources";

type PyroxeneAvailableOneTimePackagesProps = {
  packages: {
    uid: string;
    date: Date;
    description: string;
    pyroxeneDelta: number;
  }[];
  onDeleteItem: (itemUid: string) => void;
};

export default function PyroxeneAvailableOneTimePackages({
  packages,
  onDeleteItem,
}: PyroxeneAvailableOneTimePackagesProps) {
  const [show, setShow] = useState(false);

  return (
    <>
      <button
        type="button"
        className="flex w-full items-center justify-center rounded-lg bg-neutral-100 p-3 transition hover:bg-neutral-200/70 dark:bg-neutral-900 dark:hover:bg-neutral-800"
        onClick={() => setShow((prev) => !prev)}
        aria-expanded={show}
      >
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">적용중인 월간 패키지</p>
        <ChevronDownIcon
          className={`size-4 text-neutral-500 transition-transform duration-200 ease-in-out dark:text-neutral-400 ${show ? "rotate-180" : ""}`}
        />
      </button>

      {show &&
        packages.map(({ uid, date, description, pyroxeneDelta }) => (
          <PyroxeneTimelineResources
            key={uid}
            date={dayjs(date)}
            description={description}
            resources={{ pyroxene: pyroxeneDelta, oneTimeTicket: 0, tenTimeTicket: 0 }}
            itemUid={uid}
            onDeleteItem={onDeleteItem}
          />
        ))}
    </>
  );
}
