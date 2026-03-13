import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useEffect, useState, type ReactNode } from "react";
import hangul from "hangul-js";

export type PlannerSelectFormProps = {
  label: string;
  description?: string;
  name?: string;

  options: {
    label: string;
    value: string;
    searchLabel?: string;
    element?: ReactNode;
  }[];
  initialValue?: string;
  placeholder?: string;

  useSearch?: boolean;
  searchPlaceholder?: string;

  onSelect?: (value: string) => void;
};

export default function PlannerSelectForm({
  label, description, name, initialValue, placeholder, options, useSearch, searchPlaceholder, onSelect,
}: PlannerSelectFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState(initialValue);

  const selectedLabel = options.find((option) => option.value === selectedValue)?.label;
  const filteredOptions = options.filter((option) =>
    hangul.search(option.searchLabel ?? option.label, debouncedSearchQuery) >= 0
  );

  // Sync selectedValue when initialValue prop changes (e.g., when loaded from localStorage)
  useEffect(() => {
    setSelectedValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const closeOptions = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleSelect = (value: string) => {
    setSelectedValue(value);
    closeOptions();
    onSelect?.(value);
  };

  return (
    <>
      <div className="relative">
        <p className="mb-1 block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        {description && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">{description}</p>
        )}
        <button
          type="button"
          className="w-full px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex items-center justify-between hover:border-neutral-300 dark:hover:border-neutral-600 transition"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className={selectedLabel ? "" : "text-neutral-400 dark:text-neutral-500"}>
            {selectedLabel ?? placeholder ?? "선택해주세요"}
          </span>
          <ChevronDownIcon className="size-4 text-neutral-500 dark:text-neutral-400" />
        </button>
        {isOpen && (
          <div className="absolute top-full mt-4 left-0 w-full max-h-72 md:max-h-128 overflow-y-auto no-scrollbar bg-white/90 dark:bg-black/80 backdrop-blur-sm border border-neutral-100 dark:border-neutral-800 rounded-lg shadow-lg z-5">
            {useSearch && (
              <div className="sticky top-0 p-2 bg-white dark:bg-black border-b border-neutral-100 dark:border-neutral-800 rounded-t-lg z-10">
                <input
                  type="text"
                  className="w-full p-2"
                  placeholder={searchPlaceholder ?? "검색해서 찾기..."}
                  value={searchQuery}
                  onChange={(e) => {
                    e.stopPropagation();
                    setSearchQuery(e.target.value);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            {filteredOptions.length > 0 ? (
              filteredOptions.slice(0, 20).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className="flex items-center gap-x-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-100 cursor-pointer"
                  onClick={() => handleSelect(option.value)}
                >
                  {option.element ?? <div className="p-4">{option.label}</div>}
                </button>
              ))
            ) : (
              <div className="p-4 text-neutral-500 dark:text-neutral-400 text-center">
                검색 결과가 없어요
              </div>
            )}
          </div>
        )}
      </div>
      <input type="hidden" name={name} value={selectedValue} />
    </>
  );
}
