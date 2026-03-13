import { type HTMLInputTypeAttribute, useEffect, useRef } from "react";
import { Field } from "~/components/primitives";

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
    <Field label={label} description={description} error={error} htmlFor={name} containerClassName="p-4">
      <input
        ref={inputRef}
        id={name}
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full text-neutral-700 dark:text-neutral-300"
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </Field>
  );
}
