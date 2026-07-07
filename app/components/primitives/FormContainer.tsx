import type { ReactNode } from "react";

type FormContainerProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export default function FormContainer({ title, description, children }: FormContainerProps) {
  return (
    <section className="space-y-4 rounded-xl bg-neutral-50 p-4 text-card-foreground dark:bg-card md:p-5">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export type { FormContainerProps };
