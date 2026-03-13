import { useRef, useEffect } from "react";
import { Field } from "~/components/primitives";

type InputFormProps = {
  label: string;
  name?: string;
  defaultValue?: string;
  description?: string;
  placeholder?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function TextareaForm({ label, name, defaultValue, description, placeholder, error, onChange }: InputFormProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });

  return (
    <Field label={label} description={description} error={error} htmlFor={name} containerClassName="p-4">
      <textarea
        ref={inputRef}
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="mt-2 w-full resize-none text-neutral-700 dark:text-neutral-300"
        onInput={(e) => {
          adjustHeight();
          onChange?.(e.currentTarget.value);
        }}
        rows={1}
        placeholder={placeholder}
      />
    </Field>
  );
}
