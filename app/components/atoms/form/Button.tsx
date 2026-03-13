import type { ReactNode } from "react";
import PrimitiveButton from "~/components/primitives/Button";

export type ButtonProps = {
  text?: string;
  Icon?: React.ForwardRefExoticComponent<Omit<React.SVGProps<SVGSVGElement>, "ref">>;

  className?: string;
  children?: ReactNode | ReactNode[];

  type?: "button" | "submit" | "reset";
  color?: "primary" | "red" | "black";
  onClick?: () => void;
  disabled?: boolean;
};

export default function Button({ text, Icon, className, children, type, color, onClick, disabled }: ButtonProps) {
  return (
    <PrimitiveButton
      text={text}
      icon={Icon}
      className={`my-1 mr-2 ${className ?? ""}`}
      type={type}
      variant={
        color === "primary"
          ? "primary"
          : color === "red"
            ? "danger"
            : color === "black"
              ? "inverse"
              : "default"
      }
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </PrimitiveButton>
  );
}
