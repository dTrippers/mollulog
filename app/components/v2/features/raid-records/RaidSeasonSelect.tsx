import { ArrowUpRightIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { bossImageUrl } from "~/models/assets";
import type { RaidRecordSeasonView } from "~/views/raid-records";
import { v2FocusRing } from "../../layout/styles";
import { Popover } from "../../primitives/Popover";
import { SearchInput } from "../../primitives/SearchInput";
import { RaidSeasonMeta, RaidSeasonTitle } from "./RaidRecordBits";

export type RaidSeasonSelectOption = RaidRecordSeasonView & { recordUid: string | null };

const MAX_LISTED_SEASONS = 60;

export function RaidBossThumb({ bossUid, className }: { bossUid: string; className?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded bg-v2-inset", className)}>
      <img src={bossImageUrl(bossUid)} alt="" loading="lazy" className="size-full object-cover object-center" />
    </span>
  );
}

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
          "flex min-h-11 w-full max-w-[28.75rem] cursor-pointer items-center gap-2 rounded-md border border-v2-control-border bg-v2-surface py-1 pr-2 pl-1 text-left hover:border-v2-control-border-strong",
          invalid && "border-v2-danger bg-v2-danger-subtle",
          !value && "pl-3",
          v2FocusRing,
        )}
      >
        {value ? (
          <>
            <RaidBossThumb bossUid={value.boss.uid} className="h-[2.125rem] w-24" />
            <span className="flex min-w-0 flex-1 flex-col">
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
        <ChevronDownIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
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
        <div className="mt-2 max-h-80 overflow-y-auto">
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
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-v2-hover",
                    selected && "bg-v2-inset",
                    v2FocusRing,
                  )}
                >
                  <RaidBossThumb bossUid={option.boss.uid} className="h-[1.625rem] w-[4.5rem]" />
                  <span className="flex min-w-0 flex-1 flex-col">
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
                      <span className="inline-flex min-h-5 shrink-0 items-center rounded bg-v2-inset px-1.5 text-xs font-medium text-v2-fg-secondary">
                        기록 있음
                      </span>
                      <ArrowUpRightIcon className="size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                    </>
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
          )}
        </div>
        <p className="px-2 pt-1.5 pb-0.5 text-xs text-v2-fg-tertiary">이미 시작한 시즌만 표시돼요</p>
      </Popover>
    </>
  );
}
