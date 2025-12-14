import { type HTMLInputTypeAttribute, useEffect, useRef } from "react";

type PlannerInputFormProps = {
  label: string;
  type?: HTMLInputTypeAttribute;
  name?: string;
  defaultValue?: string;
  description?: string;
  placeholder?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function PlannerInputForm({ label, type, name, defaultValue, description, placeholder, error, onChange }: PlannerInputFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value when defaultValue prop changes (e.g., when loaded from localStorage)
  useEffect(() => {
    if (inputRef.current && defaultValue !== undefined) {
      inputRef.current.value = defaultValue;
    }
  }, [defaultValue]);

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1" htmlFor={name}>
        {label}
      </label>
      {description && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">{description}</p>
      )}
      <input
        ref={inputRef}
        type={type}
        name={name}
        defaultValue={defaultValue}
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
          error 
            ? "border-red-300 dark:border-red-700 focus:ring-red-500" 
            : "border-neutral-200 dark:border-neutral-700"
        }`}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm mt-1.5 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

