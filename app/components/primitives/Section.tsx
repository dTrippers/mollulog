import Panel from "./Panel";

type SectionProps = {
  title: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  titleClassName?: string;
  foldable?: boolean;
  border?: boolean;
  foldStateKey?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export default function Section({
  title,
  description,
  className,
  bodyClassName,
  titleClassName,
  foldable = false,
  border = true,
  foldStateKey,
  defaultExpanded = true,
  children,
}: SectionProps) {
  return (
    <Panel
      title={title}
      description={description}
      className={className}
      bodyClassName={bodyClassName}
      titleClassName={titleClassName}
      variant="section"
      collapsible={foldable}
      bordered={border}
      defaultExpanded={defaultExpanded}
      persistKey={foldStateKey}
    >
      {children}
    </Panel>
  );
}

export type { SectionProps };
