import type { ReactNode } from "react";

type PlannerFormGroupProps = {
  children: ReactNode | ReactNode[];
};

export default function PlannerFormGroup({ children }: PlannerFormGroupProps) {
  const childrenArray = Array.isArray(children) ? children.flat() : [children];

  return (
    <div className="space-y-4">
      {childrenArray.filter(Boolean).map((child) => (
        <div key={typeof child === "object" && child !== null && "key" in child && child.key != null ? child.key : String(child)}>
          {child}
        </div>
      ))}
    </div>
  );
}
