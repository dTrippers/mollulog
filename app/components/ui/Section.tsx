import Panel from "~/components/primitives/Panel";

type SectionProps = {
  title: string;
  description?: string;
  foldable?: boolean;
  border?: boolean;
  foldStateKey?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export function Section({ title, description, foldable = false, border = true, foldStateKey, defaultExpanded = true, children }: SectionProps) {
  return (
    <Panel
      title={title}
      description={description}
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
