import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { useRef, useState } from "react";
import type {
  StudentDirectoryPersonalState,
  StudentDirectorySort,
  StudentDirectorySortDirection,
} from "~/domain/student-directory";
import {
  defaultStudentDirectorySortDirection,
  getStudentDirectorySortLabel,
  getStudentDirectorySortTitle,
  STUDENT_DIRECTORY_SORTS,
} from "~/domain/student-directory";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";
import { Popover } from "./Popover";

const publicSorts = STUDENT_DIRECTORY_SORTS.filter((sort) => !sort.startsWith("my"));
const personalSorts = STUDENT_DIRECTORY_SORTS.filter((sort) => sort.startsWith("my"));

export function SortControl({
  sort,
  direction,
  personalStatus,
  onChange,
  onRequestSignIn,
  disabled = false,
}: {
  sort: StudentDirectorySort;
  direction: StudentDirectorySortDirection;
  personalStatus: StudentDirectoryPersonalState["status"];
  onChange: (sort: StudentDirectorySort, direction: StudentDirectorySortDirection) => void;
  onRequestSignIn: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const directionLabel = getStudentDirectorySortLabel(sort, direction);
  const toggleDirection = () => onChange(sort, direction === "desc" ? "asc" : "desc");
  const chooseSort = (nextSort: StudentDirectorySort) => {
    if (personalStatus !== "loaded" && nextSort.startsWith("my")) return;
    onChange(
      nextSort,
      nextSort === sort ? (direction === "desc" ? "asc" : "desc") : defaultStudentDirectorySortDirection(nextSort),
    );
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className="relative flex shrink-0 items-center gap-1">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`정렬 기준: ${getStudentDirectorySortTitle(sort)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex min-h-v2-control-min items-center gap-1 rounded-md bg-v2-inset px-3 text-sm text-v2-fg hover:bg-v2-filled-hover active:bg-v2-filled-hover disabled:text-v2-fg-disabled disabled:hover:bg-v2-inset",
          v2FocusRing,
        )}
      >
        <span>{getStudentDirectorySortTitle(sort)}</span>
        <ChevronDownIcon className="size-4 text-v2-fg-tertiary" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`정렬 방향: ${directionLabel}`}
        disabled={disabled}
        onClick={toggleDirection}
        className={cn(
          "inline-flex min-h-v2-control-min items-center gap-1 rounded-md bg-v2-inset px-3 text-sm text-v2-fg hover:bg-v2-filled-hover active:bg-v2-filled-hover disabled:text-v2-fg-disabled disabled:hover:bg-v2-inset",
          v2FocusRing,
        )}
      >
        {direction === "desc" ? (
          <ArrowDownIcon className="size-4" aria-hidden="true" />
        ) : (
          <ArrowUpIcon className="size-4" aria-hidden="true" />
        )}
        <span>{directionLabel}</span>
      </button>
      <Popover
        open={open && !disabled}
        label="정렬 기준 선택"
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="w-64 p-1.5"
      >
        <div className="max-h-[min(70vh,36rem)] overflow-y-auto">
          {publicSorts.map((item) => (
            <SortOption
              key={item}
              selected={sort === item}
              title={getStudentDirectorySortTitle(item)}
              sort={item}
              direction={direction}
              onClick={() => chooseSort(item)}
            />
          ))}
          <div className="my-1 border-t border-v2-divider" />
          <div className="flex min-h-v2-row-min items-center justify-between px-3 text-xs font-semibold text-v2-fg-tertiary">
            <span>내 기록</span>
            {personalStatus === "signed-out" ? (
              <button
                type="button"
                aria-label="로그인 후 사용 가능: 로그인하고 내 기록으로 정렬·필터하기"
                onClick={onRequestSignIn}
                className={cn("cursor-pointer rounded-md px-1 text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg active:bg-v2-filled-hover active:text-v2-fg", v2FocusRing)}
              >
                로그인 후 사용 가능
              </button>
            ) : null}
          </div>
          {personalSorts.map((item) => (
            <SortOption
              key={item}
              selected={sort === item}
              title={getStudentDirectorySortTitle(item)}
              sort={item}
              direction={direction}
              onClick={() => chooseSort(item)}
              disabled={personalStatus !== "loaded"}
            />
          ))}
        </div>
      </Popover>
    </div>
  );
}

function SortOption({
  selected,
  title,
  sort,
  direction,
  onClick,
  disabled = false,
}: {
  selected: boolean;
  title: string;
  sort: StudentDirectorySort;
  direction: StudentDirectorySortDirection;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-v2-row-min w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-v2-hover active:bg-v2-filled-hover disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-transparent",
        selected ? "bg-v2-hover text-v2-fg" : "text-v2-fg-secondary",
        v2FocusRing,
      )}
    >
      <span>{title}</span>
      {selected ? (
        <span className="ml-3 inline-flex items-center gap-1 text-xs tabular-nums text-v2-fg-secondary">
          <span aria-hidden="true">{direction === "desc" ? "↓" : "↑"}</span>
          {getStudentDirectorySortLabel(sort, direction)}
        </span>
      ) : null}
    </button>
  );
}
