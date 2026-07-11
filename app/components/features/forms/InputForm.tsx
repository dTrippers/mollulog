import type { HTMLInputTypeAttribute } from "react";
import { Input } from "~/components/primitives";

type InputFormProps = {
  label: string;
  type?: HTMLInputTypeAttribute;
  name?: string;
  value?: string;
  defaultValue?: string;
  description?: string;
  placeholder?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function InputForm({
  label,
  type,
  name,
  value,
  defaultValue,
  description,
  placeholder,
  error,
  onChange,
}: InputFormProps) {
  return (
    <Input
      key={`${name ?? "input"}:${defaultValue ?? ""}`}
      label={label}
      description={description}
      error={error}
      containerClassName="p-4"
      type={type}
      name={name}
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
}
