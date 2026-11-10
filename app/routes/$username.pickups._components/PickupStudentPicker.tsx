import { PlusIcon, XMarkIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { type ReactNode, useId, useRef, useState } from "react";
import { RoundStudentImage } from "~/components/v2/features/students/RoundStudentImage";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { StudentThumbList } from "~/components/v2/features/students/StudentThumbList";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";

// "시로코*테러" reads as "시로코(테러)", as the screen shows it.
function formatPickerName(rawName: string): string {
  const { name, variant } = splitVisibleStudentName(rawName);
  return variant ? `${name}(${variant})` : name;
}

import { v2FocusRing } from "~/components/v2/layout/styles";
import { Popover } from "~/components/v2/primitives/Popover";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { cn } from "~/lib/utils";

export type PickupStudentOption = { uid: string; name: string };

const MAX_LISTED_STUDENTS = 50;

type PickupStudentPickerProps = {
  label: string;
  description?: string;
  // Beside the label, such as the "선택하지 않기" checkbox.
  labelAction?: ReactNode;
  options: PickupStudentOption[];
  // Uids that come first in the list and carry the "픽업" mark.
  pickupUids?: ReadonlySet<string>;
  selectedUids: string[];
  maxCount?: number;
  onChange: (uids: string[]) => void;
  // Shown instead of the tiles while the answer to an earlier input is missing.
  blockedReason?: string;
  // Keeps the footer but drops the portraits and the add tile, for a list the user chose not to enter.
  hideSelection?: boolean;
  error?: string;
  footer?: ReactNode;
};

// The selected students as portraits with a remove mark, and one tile that opens the search to add another. A student
// can be picked twice, since a record can hold the same ★3 student more than once.
export default function PickupStudentPicker({
  label,
  description,
  labelAction,
  options,
  pickupUids,
  selectedUids,
  maxCount,
  onChange,
  blockedReason,
  hideSelection = false,
  error,
  footer,
}: PickupStudentPickerProps) {
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const full = maxCount !== undefined && selectedUids.length >= maxCount;
  const byUid = new Map(options.map((option) => [option.uid, option] as const));
  const ordered = pickupUids
    ? [...options].sort((a, b) => Number(pickupUids.has(b.uid)) - Number(pickupUids.has(a.uid)))
    : options;
  const matches = ordered.filter((option) => hangul.search(option.name, query.trim()) >= 0);

  const closePopover = () => {
    setOpen(false);
    setQuery("");
  };
  const add = (uid: string) => {
    onChange([...selectedUids, uid]);
    if (maxCount !== undefined && selectedUids.length + 1 >= maxCount) closePopover();
  };

  return (
    <fieldset aria-labelledby={titleId} className="m-0 min-w-0 border-0 p-0">
      <div className="flex min-h-v2-row-min flex-wrap items-center justify-between gap-x-3">
        <p id={titleId} className="text-sm font-semibold text-v2-fg">
          {label}
        </p>
        {labelAction}
      </div>
      {description ? <p className="text-xs text-v2-fg-tertiary">{description}</p> : null}
      {blockedReason ? (
        <p className="mt-2 text-sm text-v2-fg-tertiary">{blockedReason}</p>
      ) : (
        <>
          {hideSelection ? null : (
            <>
              <StudentThumbList className="mt-3">
                {selectedUids.map((uid, index) => {
                  const option = byUid.get(uid);
                  if (!option) return null;
                  const { name, variant } = splitVisibleStudentName(option.name);
                  return (
                    // The same student can be selected twice, so the position joins the key.
                    // biome-ignore lint/suspicious/noArrayIndexKey: duplicates are valid and the list is edited by position
                    <li key={`${uid}-${index}`} className="relative">
                      <StudentThumb
                        studentUid={uid}
                        name={name}
                        variant={variant}
                        recruitmentLabel={pickupUids?.has(uid) ? "픽업" : undefined}
                      />
                      <button
                        type="button"
                        aria-label={`${formatPickerName(option.name)} 제거`}
                        onClick={() => onChange(selectedUids.filter((_, position) => position !== index))}
                        className={cn(
                          "absolute top-0.5 right-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-v2-scrim text-v2-on-media",
                          v2FocusRing,
                        )}
                      >
                        <XMarkIcon className="size-3" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
                <li className="flex w-14 flex-col items-center sm:w-16">
                  <button
                    ref={triggerRef}
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-label={`${label} 추가`}
                    disabled={full}
                    onClick={() => setOpen((prev) => !prev)}
                    className={cn(
                      "flex aspect-[5/6] w-full cursor-pointer items-center justify-center rounded-md bg-v2-inset text-v2-fg-secondary hover:bg-v2-filled-hover disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-v2-inset",
                      v2FocusRing,
                    )}
                  >
                    <PlusIcon className="size-5" aria-hidden="true" />
                  </button>
                  <span
                    aria-hidden="true"
                    className={cn("mt-1 text-xs leading-4", full ? "text-v2-fg-disabled" : "text-v2-fg-tertiary")}
                  >
                    추가
                  </span>
                </li>
              </StudentThumbList>
              <Popover
                open={open}
                label={`${label} 찾기`}
                onClose={closePopover}
                returnFocusRef={triggerRef}
                anchorRef={triggerRef}
                className="w-[min(22rem,calc(100vw-2rem))] p-2"
              >
                <SearchInput
                  aria-label={`${label} 찾기`}
                  placeholder="학생 이름으로 찾기"
                  value={query}
                  onChange={setQuery}
                />
                <div className="mt-2 max-h-72 overflow-y-auto">
                  {matches.length > 0 ? (
                    matches.slice(0, MAX_LISTED_STUDENTS).map((option) => {
                      const { name, variant } = splitVisibleStudentName(option.name);
                      return (
                        <button
                          key={option.uid}
                          type="button"
                          onClick={() => add(option.uid)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-v2-hover",
                            v2FocusRing,
                          )}
                        >
                          <RoundStudentImage studentUid={option.uid} size="md" />
                          <span className="min-w-0 flex-1 truncate text-sm text-v2-fg">
                            {name}
                            {variant ? <span className="ml-1 text-xs text-v2-fg-tertiary">{variant}</span> : null}
                          </span>
                          {pickupUids?.has(option.uid) ? (
                            <span className="text-xs text-v2-fg-secondary">픽업</span>
                          ) : null}
                          {selectedUids.includes(option.uid) ? (
                            <span className="text-xs text-v2-fg-tertiary">선택됨</span>
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
                  )}
                </div>
              </Popover>
            </>
          )}
          {footer}
        </>
      )}
      {error ? <FieldError>{error}</FieldError> : null}
    </fieldset>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <StatusNotice tone="danger" className="mt-2">
      {children}
    </StatusNotice>
  );
}
