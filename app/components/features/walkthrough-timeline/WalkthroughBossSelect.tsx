import { CheckIcon, ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import hangul from "hangul-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { bossImageUrl } from "~/models/assets";

type WalkthroughBossSelectProps = {
  value: string;
  options: { uid: string; name: string }[];
  onChange: (uid: string) => void;
};

function BossArtwork({ uid }: { uid: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-contain bg-right bg-no-repeat"
      style={{ backgroundImage: `url(${bossImageUrl(uid)})` }}
    />
  );
}

export default function WalkthroughBossSelect({ value, options, onChange }: WalkthroughBossSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const selected = options.find((option) => option.uid === value) ?? options[0];
  const filteredOptions = useMemo(
    () => options.filter((option) => hangul.search(option.name, query.trim()) >= 0),
    [options, query],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };

  const select = (uid: string) => {
    onChange(uid);
    close();
  };

  const toggle = () => {
    if (isOpen) {
      close();
      return;
    }
    setFocusedIndex(
      Math.max(
        0,
        options.findIndex((option) => option.uid === value),
      ),
    );
    setIsOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative flex min-h-10 w-full items-center overflow-hidden rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`보스 ${selected?.name ?? "선택"}`}
        onClick={toggle}
      >
        {selected?.uid ? <BossArtwork uid={selected.uid} /> : null}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/15" />
        <span className="relative z-10 min-w-0 flex-1 truncate font-medium">
          {selected?.name ?? "보스를 선택하세요"}
        </span>
        <ChevronDownIcon
          className={cn("relative z-10 ml-2 size-4 shrink-0 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {isOpen ? (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="sticky top-0 z-20 border-b border-border bg-popover p-2">
            <div className="flex min-h-9 items-center gap-2 rounded-md bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
              <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                placeholder="보스 이름으로 찾기"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFocusedIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setFocusedIndex((index) => Math.min(index + 1, Math.max(0, filteredOptions.length - 1)));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setFocusedIndex((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const option = filteredOptions[focusedIndex];
                    if (option) select(option.uid);
                  }
                }}
              />
            </div>
          </div>

          <div role="listbox" aria-label="보스 목록">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.uid === value}
                  key={option.uid}
                  className={cn(
                    "relative flex h-14 w-full items-center overflow-hidden px-3 text-left transition-colors",
                    index === focusedIndex ? "bg-muted" : "hover:bg-muted/70",
                  )}
                  onMouseEnter={() => setFocusedIndex(index)}
                  onClick={() => select(option.uid)}
                >
                  {option.uid ? <BossArtwork uid={option.uid} /> : null}
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-popover via-popover/90 to-popover/10" />
                  <span className="relative z-10 min-w-0 flex-1 truncate pr-2 font-semibold">{option.name}</span>
                  {option.uid === value ? <CheckIcon className="relative z-10 size-4 shrink-0" /> : null}
                </button>
              ))
            ) : (
              <p className="p-4 text-center text-sm text-muted-foreground">검색 결과가 없어요</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
