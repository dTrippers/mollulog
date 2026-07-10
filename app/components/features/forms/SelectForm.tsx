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
              <p className="mt-2 text-muted-foreground">{selectedLabel ?? placeholder}</p>
            )}
          </Field>
          <ChevronDownIcon className="absolute top-1/2 right-4 size-4 -translate-y-1/2" />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 z-5 mt-4 max-h-72 w-full overflow-y-auto rounded-lg bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm md:max-h-128">
            {useSearch && (
              <div className="sticky top-0 z-10 rounded-t-lg bg-popover p-2 shadow-sm">
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
                  className="flex w-full cursor-pointer items-center gap-x-2 text-left transition-colors duration-100 hover:bg-muted"
                  onClick={() => handleSelect(option.value)}
                >
                  {option.element ?? <div className="px-4 py-3">{option.label}</div>}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground">검색 결과가 없어요</div>
            )}
          </div>
        )}
      </div>
      <input type="hidden" name={name} value={selectedValue} />
    </>
  );
}
