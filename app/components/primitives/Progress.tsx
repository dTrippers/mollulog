export type ProgressProps = {
  ratio: number;
  color: "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "fuchsia" | "pink";
};

export default function Progress({ ratio, color }: ProgressProps) {
  let colorClass = "";
  switch (color) {
    case "red":
      colorClass = "bg-linear-to-r from-red-500 to-orange-300";
      break;
    case "orange":
      colorClass = "bg-linear-to-r from-orange-500 to-amber-300";
      break;
    case "yellow":
      colorClass = "bg-linear-to-r from-amber-500 to-yellow-300";
      break;
    case "green":
      colorClass = "bg-linear-to-r from-green-500 to-emerald-300";
      break;
    case "cyan":
      colorClass = "bg-linear-to-r from-blue-500 to-sky-300";
      break;
    case "blue":
      colorClass = "bg-linear-to-r from-blue-500 to-indigo-300";
      break;
    case "purple":
      colorClass = "bg-linear-to-r from-purple-500 to-fuchsia-300";
      break;
    case "fuchsia":
      colorClass = "bg-linear-to-r from-fuchsia-500 to-pink-300";
      break;
    case "pink":
      colorClass = "bg-linear-to-r from-pink-500 to-rose-300";
      break;
  }

  return (
    <div className="relative my-2 h-2 w-full rounded-full bg-muted">
      <div className={`absolute h-2 top-0 left-0 ${colorClass} rounded-full`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
