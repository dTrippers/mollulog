import { ChevronDownIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
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
        className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-card px-3 py-2.5 shadow-sm transition-colors hover:bg-foreground/10"
        onClick={() => setShow((prev) => !prev)}
        aria-expanded={show}
      >
        <p className="text-sm font-medium text-muted-foreground">적용중인 패키지</p>
        <ChevronDownIcon
          className={`size-4 text-muted-foreground transition-transform duration-200 ease-in-out ${show ? "rotate-180" : ""}`}
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
