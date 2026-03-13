import type { ButtonProps } from "./Button";
import PrimitiveButton from "~/components/primitives/Button";

export default function SmallButton({ type, text, children, color, onClick }: ButtonProps) {
  return (
    <PrimitiveButton
      type={type}
      text={text}
      variant={color === "red" ? "danger" : "default"}
      size="sm"
      className="my-1 mr-1"
      onClick={onClick}
    >
      {children}
    </PrimitiveButton>
  );
}
