type PlannerButtonFormProps = {
  type?: "button" | "submit" | "reset";
  label: string;
  color?: "default" | "blue" | "red";
  onClick?: () => void;
};

export default function PlannerButtonForm({ type = "button", label, color = "default", onClick }: PlannerButtonFormProps) {
  const colorClass = {
    default: "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-100",
    blue: "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800",
    red: "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800",
  }[color];

  return (
    <button 
      type={type} 
      className={`w-full px-3 py-1.5 text-sm rounded-md font-medium transition ${colorClass}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

