import { ArrowUpRightIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import type { RaidRecordSeasonView } from "~/views/raid-records";
import { v2FocusRing } from "../../layout/styles";
import { Popover } from "../../primitives/Popover";
import { SearchInput } from "../../primitives/SearchInput";
import { RaidBossBackdrop, RaidSeasonMeta, RaidSeasonTitle } from "./RaidRecordBits";

export type RaidSeasonSelectOption = RaidRecordSeasonView & { recordUid: string | null };

const MAX_LISTED_SEASONS = 60;

// The season of a new record: started seasons of the server and raid type, newest first, searchable by number or boss.
// A season that already has a record carries "기록 있음", and choosing it opens that record instead.
export function RaidSeasonSelect({
  options,
  value,
  timeZone,
  invalid = false,
  describedBy,
  onChange,
  onOpenRecord,
}: {
  options: readonly RaidSeasonSelectOption[];
  value: RaidSeasonSelectOption | null;
  timeZone: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (option: RaidSeasonSelectOption) => void;
  onOpenRecord: (recordUid: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const trimmed = query.trim().replace(/^#/, "");
    if (!trimmed) return options;
    return options.filter(
      (option) => String(option.seasonIndex) === trimmed || hangul.search(option.boss.name, trimmed) >= 0,
    );
  }, [options, query]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={value ? `시즌 #${value.seasonIndex} ${value.boss.name}, 바꾸기` : "시즌 선택"}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative flex min-h-11 w-full max-w-[28.75rem] cursor-pointer items-center gap-2 overflow-hidden rounded-md border border-v2-control-border bg-v2-surface py-1.5 pr-2 pl-3 text-left hover:border-v2-control-border-strong v2-interaction-transition",
          invalid && "border-v2-danger bg-v2-danger-subtle",
          v2FocusRing,
        )}
      >
        {value ? (
          <>
            {invalid ? null : <RaidBossBackdrop bossUid={value.boss.uid} />}
            <span className="relative flex min-w-0 flex-1 flex-col">
              <RaidSeasonTitle
                server={value.server}
                seasonIndex={value.seasonIndex}
                counterpartSeasonIndex={value.counterpartSeasonIndex}
                bossName={value.boss.name}
                ongoing={value.ongoing}
                className="text-sm font-semibold text-v2-fg"
              />
              <RaidSeasonMeta
                terrain={value.terrain}
                defenseTypes={value.displayDefenseTypes}
                startAt={value.startAt}
                endAt={value.endAt}
                timeZone={timeZone}
                className="text-v2-fg-tertiary"
              />
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-v2-fg-tertiary">시즌 선택</span>
        )}
        <ChevronDownIcon className="relative size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      </button>
      <Popover
        open={open}
        label="시즌 선택"
        onClose={close}
        returnFocusRef={triggerRef}
        anchorRef={triggerRef}
        className="w-[min(28.75rem,calc(100vw-2rem))] p-2"
      >
        <SearchInput aria-label="시즌 찾기" placeholder="시즌 번호·보스 이름으로 찾기" value={query} onChange={setQuery} />
        <div className="mt-2 flex max-h-80 flex-col gap-1 overflow-y-auto">
          {matches.length > 0 ? (
            matches.slice(0, MAX_LISTED_SEASONS).map((option) => {
              const selected = value?.seasonIndex === option.seasonIndex;
              return (
                <button
                  key={option.seasonIndex}
                  type="button"
                  aria-current={selected || undefined}
                  onClick={() => {
                    close();
                    triggerRef.current?.focus();
                    if (option.recordUid) onOpenRecord(option.recordUid);
                    else onChange(option);
                  }}
                  className={cn(
                    "group relative flex w-full shrink-0 cursor-pointer items-center gap-2.5 overflow-hidden rounded-md px-3 py-2.5 text-left",
                    v2FocusRing,
                  )}
                >
                  <RaidBossBackdrop bossUid={option.boss.uid} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute inset-0 group-hover:bg-v2-hover v2-interaction-transition",
                      selected && "bg-v2-hover before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-v2-accent",
                    )}
                  />
                  <span className="relative flex min-w-0 flex-1 flex-col">
                    <RaidSeasonTitle
                      server={option.server}
                      seasonIndex={option.seasonIndex}
                      counterpartSeasonIndex={option.counterpartSeasonIndex}
                      bossName={option.boss.name}
                      ongoing={option.ongoing}
                      className="text-sm font-semibold text-v2-fg"
                    />
                    <RaidSeasonMeta
                      terrain={option.terrain}
                      defenseTypes={option.displayDefenseTypes}
                      startAt={option.startAt}
                      endAt={option.endAt}
                      timeZone={timeZone}
                      className="text-v2-fg-tertiary"
                    />
                  </span>
                  {option.recordUid ? (
                    <>
                      <span className="relative inline-flex min-h-5 shrink-0 items-center rounded bg-v2-inset px-1.5 text-xs font-medium text-v2-fg-secondary">
                        기록 있음
                      </span>
                      <ArrowUpRightIcon className="relative size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                    </>
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
  );
}
