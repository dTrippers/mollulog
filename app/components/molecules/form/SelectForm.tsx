import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useEffect, useState, type ReactNode } from "react";
import hangul from "hangul-js";
import { useFormGroup } from "~/components/organisms/form/FormGroup";
import { Field } from "~/components/primitives";

export type SelectFormProps = {
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

export default function SelectForm({
  label, description, name, initialValue, placeholder, options, useSearch, searchPlaceholder, onSelect,
}: SelectFormProps) {
  const { submitFormGroup } = useFormGroup();

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
    submitFormGroup();
  };

  return (
    <>
      <div className="p-4 relative">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <Field label={label} description={description} containerClassName="pointer-events-none">
            {(selectedLabel ?? placeholder) && <p className="mt-1 text-neutral-700 dark:text-neutral-300">{selectedLabel ?? placeholder}</p>}
          </Field>
          <ChevronDownIcon className="size-4 absolute right-4 top-1/2 -translate-y-1/2" />
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
