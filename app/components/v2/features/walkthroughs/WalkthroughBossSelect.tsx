import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { bossImageUrl } from "~/models/assets";
import { v2FocusRing } from "../../layout/styles";
import { Popover } from "../../primitives/Popover";

function BossArtwork({ uid, className }: { uid: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-contain bg-right bg-no-repeat opacity-70",
        className,
      )}
      style={{ backgroundImage: `url(${bossImageUrl(uid)})` }}
    />
  );
}

// The boss of a guide: a button with the boss's image, and a searchable list of the bosses a guide can be written for.
export function WalkthroughBossSelect({
  id,
  value,
  options,
  onChange,
  invalid = false,
  describedBy,
}: {
  id?: string;
  value: string;
  options: readonly { uid: string; name: string }[];
  onChange: (uid: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.uid === value) ?? null;
  const filtered = useMemo(
    () => options.filter((option) => hangul.search(option.name, query.trim()) >= 0),
    [options, query],
  );
  const active = filtered[Math.min(activeIndex, filtered.length - 1)] ?? null;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.uid === value)));
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, options, value]);

  useEffect(() => {
    if (!open || !active) return;
    listRef.current?.querySelector<HTMLElement>(`[data-uid="${active.uid}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const choose = (uid: string) => {
    onChange(uid);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "relative flex min-h-v2-control-min w-full min-w-0 cursor-pointer items-center overflow-hidden rounded-md bg-v2-inset py-1 pr-8 pl-3 text-left text-sm text-v2-fg hover:bg-v2-filled-hover v2-interaction-transition",
          invalid && "ring-1 ring-v2-danger",
          v2FocusRing,
        )}
      >
        {selected ? <BossArtwork uid={selected.uid} className="right-8 w-1/2" /> : null}
        <span className={cn("relative min-w-0 flex-1 truncate", !selected && "text-v2-fg-tertiary")}>
          {selected?.name ?? "보스 선택"}
        </span>
        <ChevronDownIcon
          className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-v2-fg-tertiary"
          aria-hidden="true"
        />
      </button>
      <Popover
        open={open}
        label="보스 선택"
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="w-80 max-w-[calc(100vw-2rem)] p-1.5"
      >
        <label className="mb-1 flex h-v2-control-min items-center gap-2 rounded-md bg-v2-inset px-2.5 text-v2-fg-secondary">
          <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden="true" />
          <input
            ref={searchRef}
            role="combobox"
            aria-label="보스 이름으로 찾기"
            aria-autocomplete="list"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={active ? `${listId}-${active.uid}` : undefined}
            value={query}
            placeholder="보스 이름으로 찾기"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (filtered.length === 0) return;
                const current = Math.min(activeIndex, filtered.length - 1);
                setActiveIndex(
                  event.key === "ArrowDown" ? Math.min(current + 1, filtered.length - 1) : Math.max(current - 1, 0),
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (active) choose(active.uid);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-base text-v2-fg outline-none placeholder:text-v2-fg-tertiary sm:text-sm"
          />
        </label>
        <div ref={listRef} id={listId} role="listbox" aria-label="보스 목록" className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
          ) : (
            filtered.map((option) => (
              <div
                key={option.uid}
                id={`${listId}-${option.uid}`}
                data-uid={option.uid}
                role="option"
                aria-selected={option.uid === value}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={(event) => {
                  if (event.movementX !== 0 || event.movementY !== 0) setActiveIndex(filtered.indexOf(option));
                }}
                onClick={() => choose(option.uid)}
                className={cn(
                  "relative flex h-12 cursor-pointer items-center overflow-hidden rounded-md px-2.5 text-sm font-semibold text-v2-fg",
                  option.uid === active?.uid && "bg-v2-hover",
                )}
              >
                <BossArtwork uid={option.uid} />
                <span className="relative min-w-0 flex-1 truncate">{option.name}</span>
                {option.uid === value ? (
                  <CheckIcon className="relative size-4 shrink-0 text-v2-link" aria-hidden="true" />
                ) : null}
              </div>
            ))
          )}
        </div>
      </Popover>
    </>
  );
}
