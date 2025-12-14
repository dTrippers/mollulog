import type { ReactNode } from "react";

type PlannerFormGroupProps = {
  children: ReactNode | ReactNode[];
};

export default function PlannerFormGroup({ children }: PlannerFormGroupProps) {
  const childrenArray = Array.isArray(children) ? children.flat() : [children];

  return (
    <div className="space-y-4">
      {childrenArray.filter(Boolean).map((child, index) => (
        <div key={index}>
          {child}
        </div>
      ))}
    </div>
  );
}

