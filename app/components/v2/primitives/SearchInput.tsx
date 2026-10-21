import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";

export function SearchInput({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value || disabled) return;
    const timer = window.setTimeout(() => onChange(draft), 150);
    return () => window.clearTimeout(timer);
  }, [disabled, draft, onChange, value]);

  return (
    <label
      className={cn(
        "flex h-v2-control-min min-h-v2-control-min min-w-0 items-center gap-2 rounded-md bg-v2-surface px-3 text-v2-fg-secondary ring-1 ring-v2-control-border",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-v2-focus",
        className,
      )}
    >
      <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        aria-label="이름 검색"
        placeholder="학생 이름"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        className="min-w-0 flex-1 appearance-none bg-transparent text-base text-v2-fg outline-none placeholder:text-v2-fg-tertiary disabled:text-v2-fg-disabled sm:text-sm [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="검색어 지우기"
          disabled={disabled}
          onClick={() => {
            setDraft("");
            onChange("");
            inputRef.current?.focus();
          }}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg active:bg-v2-filled-hover disabled:cursor-not-allowed disabled:text-v2-fg-disabled"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}
