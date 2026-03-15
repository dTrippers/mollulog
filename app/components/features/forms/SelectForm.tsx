import { ChevronDownIcon } from "@heroicons/react/20/solid";
import hangul from "hangul-js";
import { useEffect, useState, type ReactNode } from "react";
import { Field } from "~/components/primitives";
import { useFormGroup } from "./FormGroup";

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
  label,
  description,
  name,
  initialValue,
  placeholder,
  options,
  useSearch,
  searchPlaceholder,
  onSelect,
}: SelectFormProps) {
  const { submitFormGroup } = useFormGroup();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState(initialValue);

  const selectedLabel = options.find((option) => option.value === selectedValue)?.label;
  const filteredOptions = options.filter(
    (option) => hangul.search(option.searchLabel ?? option.label, debouncedSearchQuery) >= 0,
  );

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
      <div className="relative p-4">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <Field label={label} description={description} containerClassName="pointer-events-none">
            {(selectedLabel ?? placeholder) && (
              <p className="mt-2 text-neutral-500 dark:text-neutral-400">{selectedLabel ?? placeholder}</p>
            )}
          </Field>
          <ChevronDownIcon className="absolute top-1/2 right-4 size-4 -translate-y-1/2" />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 z-5 mt-4 max-h-72 w-full overflow-y-auto rounded-lg border border-neutral-100 bg-white/90 shadow-lg backdrop-blur-sm dark:border-neutral-800 dark:bg-black/80 md:max-h-128">
            {useSearch && (
              <div className="sticky top-0 z-10 rounded-t-lg border-b border-neutral-100 bg-white p-2 dark:border-neutral-800 dark:bg-black">
                <input
                  type="text"
                  className="w-full p-2"
                  placeholder={searchPlaceholder ?? "검색해서 찾기..."}
                  value={searchQuery}
                  onChange={(event) => {
                    event.stopPropagation();
                    setSearchQuery(event.target.value);
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            )}
            {filteredOptions.length > 0 ? (
              filteredOptions.slice(0, 20).map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className="flex w-full cursor-pointer items-center gap-x-2 text-left transition-colors duration-100 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  onClick={() => handleSelect(option.value)}
                >
                  {option.element ?? <div className="px-4 py-3">{option.label}</div>}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-neutral-500 dark:text-neutral-400">검색 결과가 없어요</div>
            )}
          </div>
        )}
      </div>
      <input type="hidden" name={name} value={selectedValue} />
    </>
  );
}
