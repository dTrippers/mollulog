import { useEffect, useState } from "react";

type NumberInputProps = {
  label?: string;
  defaultValue?: number;
  value?: number;
  maxValue?: number;
  onChange: (value: number) => void;
};

export default function NumberInput({ label, defaultValue, value, maxValue, onChange }: NumberInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? value ?? 0);

  // Sync with external value changes
  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  return (
    <div>
      {label && <p className="mb-1 text-sm text-neutral-700 dark:text-neutral-200 font-medium">{label}</p>}
      <div className="w-full flex items-center rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900">
        <button
          type="button"
          onClick={() => {
            const newValue = internalValue - 1;
            setInternalValue(newValue);
            onChange(newValue);
          }}
          className="px-2 py-1 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
          disabled={internalValue <= 0}
          aria-label="감소"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={internalValue}
          onChange={(e) => {
            const inputValue = e.target.value;
            // Only allow digits and remove leading zeros
            const digitsOnly = inputValue.replace(/[^0-9]/g, "");
            const cleanValue = digitsOnly.replace(/^0+/, "") || "0";

            let numValue = Number(cleanValue);
            // Validate range: 0-(inf)
            if (numValue < 0) numValue = 0;
            if (maxValue !== undefined && numValue >= maxValue) numValue = maxValue;
            setInternalValue(numValue);
            onChange(numValue);
          }}
          className="w-full shrink py-1 text-center text-sm bg-transparent text-neutral-900 dark:text-neutral-100 focus:outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
        <button
          type="button"
          onClick={() => {
            const newValue = Math.min(internalValue + 1, maxValue ?? Number.POSITIVE_INFINITY);
            setInternalValue(newValue);
            onChange(newValue);
          }}
          className="px-2 py-1 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
          disabled={maxValue !== undefined && internalValue >= maxValue}
          aria-label="증가"
        >
          +
        </button>
      </div>
    </div>
  );
}