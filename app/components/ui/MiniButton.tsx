type MiniButtonProps = {
  text: string;
  onClick: () => void;
  color?: "default" | "blue" | "red";
  minimizeWidth?: boolean;
  disabled?: boolean;
};

export function MiniButton({ text, onClick, color = "default", minimizeWidth = false, disabled = false }: MiniButtonProps) {
  let colorClass = {
    default: "text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/20 hover:bg-neutral-100 dark:hover:bg-neutral-900/30 border-neutral-200 dark:border-neutral-800",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-red-200 dark:border-red-800",
  }[disabled ? "default" : color];

  const paddingClass = minimizeWidth ? "px-1" : "px-2.5";
  const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${paddingClass} py-1 text-xs font-medium rounded-md transition whitespace-nowrap border ${disabledClass} ${colorClass}`}
    >
      {text}
    </button>
  );
}
