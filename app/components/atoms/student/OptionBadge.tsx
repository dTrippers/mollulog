type OptionBadgeProps = {
  text: string;
  bgColor?: "dark" | "grey" | "light";
  color?: "red" | "yellow" | "green" | "blue" | "purple" | "grey";
};

const bgColorClass = {
  dark: "bg-neutral-800 text-white",
  grey: "bg-neutral-200",
  light: "bg-neutral-100 dark:bg-neutral-900",
};

const colorClass = {
  white: "bg-white",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-600",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  grey: "bg-neutral-500",
};

export default function OptionBadge({ text, color, bgColor }: OptionBadgeProps) {
  return (
    <div className={`flex-shrink-0 px-2 py-0.5 flex items-center ${bgColorClass[bgColor ?? "grey"]} dark:bg-neutral-800 rounded-full`}>
      {color && <div className={`size-2.5 rounded-full mr-1 ` + colorClass[color]} />}
      <span className="text-xs md:text-sm">{text}</span>
    </div>
  );
}
