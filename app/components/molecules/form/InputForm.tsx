import { type HTMLInputTypeAttribute, useEffect, useRef } from "react";

type InputFormProps = {
  label: string;
  type?: HTMLInputTypeAttribute;
  name?: string;
  defaultValue?: string;
  description?: string;
  placeholder?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function InputForm({ label, type, name, defaultValue, description, placeholder, error, onChange }: InputFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value when defaultValue prop changes (e.g., when loaded from localStorage)
  useEffect(() => {
    if (inputRef.current && defaultValue !== undefined) {
      inputRef.current.value = defaultValue;
    }
  }, [defaultValue]);

  return (
    <div className="p-4" onClick={() => inputRef.current?.focus()}>
      <label className="font-bold" htmlFor={name}>{label}</label>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
      <div className="mt-1 text-neutral-700 dark:text-neutral-300">
        <input
          ref={inputRef}
          type={type}
          name={name}
          defaultValue={defaultValue}
          className="w-full"
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
        />
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
