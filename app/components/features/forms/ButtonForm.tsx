import Button from "~/components/primitives/Button";

type ButtonFormProps = {
  type?: "button" | "submit" | "reset";
  label: string;
  color?: "default" | "blue" | "red";
  onClick?: () => void;
};

export default function ButtonForm({
  type = "button",
  label,
  color = "default",
  onClick,
}: ButtonFormProps) {
  return (
    <Button
      type={type}
      text={label}
      variant="list"
      size="list"
      className={color === "blue" ? "text-blue-500" : color === "red" ? "text-red-500" : ""}
      onClick={onClick}
      fullWidth
    />
  );
}
