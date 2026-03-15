import PrimitiveButton from "./Button";

type MiniButtonProps = {
  text: string;
  onClick: () => void;
  color?: "default" | "blue" | "red";
  minimizeWidth?: boolean;
  disabled?: boolean;
};

export default function MiniButton({ text, onClick, color = "default", minimizeWidth = false, disabled = false }: MiniButtonProps) {
  return (
    <PrimitiveButton
      text={text}
      onClick={onClick}
      disabled={disabled}
      variant={color === "blue" ? "tint-blue" : color === "red" ? "tint-red" : "tint"}
      size="xs"
      compact={minimizeWidth}
    />
  );
}
