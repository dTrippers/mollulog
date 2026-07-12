import { useEffect, useRef } from "react";
import { Field } from "~/components/primitives";

type TextareaFormProps = {
  label: string;
  name?: string;
  defaultValue?: string;
  description?: string;
  placeholder?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function TextareaForm({
  label,
  name,
  defaultValue,
  description,
  placeholder,
  error,
  onChange,
}: TextareaFormProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  });

  const adjustHeight = () => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  return (
    <Field label={label} description={description} error={error} htmlFor={name} containerClassName="p-4">
      <textarea
        ref={inputRef}
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="mt-2 w-full resize-none text-foreground placeholder:text-muted-foreground/50"
        onInput={(event) => {
          adjustHeight();
          onChange?.(event.currentTarget.value);
        }}
        rows={1}
        placeholder={placeholder}
      />
    </Field>
  );
}
