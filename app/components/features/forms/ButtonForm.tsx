import Button from "~/components/primitives/Button";

type ButtonFormProps = {
  type?: "button" | "submit" | "reset";
  label: string;
  color?: "default" | "blue" | "red";
  onClick?: () => void;
};

export default function ButtonForm({ type = "button", label, color = "default", onClick }: ButtonFormProps) {
  return (
    <Button
      type={type}
      text={label}
      className={`min-h-12 justify-start border-transparent bg-transparent p-4 text-left shadow-none hover:bg-muted ${
        color === "blue" ? "text-primary" : color === "red" ? "text-destructive" : ""
      }`}
      onClick={onClick}
      fullWidth
    />
  );
}
