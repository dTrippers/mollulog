import Panel from "~/components/primitives/Panel";

export type PagePanelProps = {
  title: string;
  description?: string;
  Icon: React.ElementType;
  foldable?: boolean;
  disabled?: boolean;

  children: React.ReactNode;
};

export default function PagePanel({ Icon, title, description, foldable, disabled, children }: PagePanelProps) {
  return (
    <Panel
      title={title}
      description={description}
      Icon={Icon}
      variant="card"
      collapsible={foldable}
      disabled={disabled}
      defaultExpanded={disabled ? false : !(foldable ?? false)}
    >
      {children}
    </Panel>
  );
}
