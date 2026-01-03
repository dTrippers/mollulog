import { sanitizeClassName } from "~/prophandlers";

type TextareaProps = {
  className?: string;
  name?: string;
  label?: string;
  description?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  error?: string;
  onChange?: (value: string) => void;
};

export default function Textarea({
  className, name, label, description, placeholder, rows, required, defaultValue, value, error, onChange,
}: TextareaProps) {
  return (
    <div className="mt-2 mb-8 last:mb-4 mr-1 md:mr-2">
      {label && <p className="font-bold my-2">{label}</p>}
      {description && <p className="my-2 text-sm text-neutral-500">{description}</p>}
      <textarea
        name={name}
        placeholder={placeholder}
        rows={rows}
        className={sanitizeClassName(`
          h-24 md:h-32 w-full p-2 border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 rounded-lg shadow transition
          ${error ? "border-red-300 shadow-red-300 dark:border-red-700 dark:shadow-red-700" : ""}
          ${className ?? ""}
        `)}
        required={required}
        defaultValue={defaultValue}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );
}
