import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useId } from "react";
import { cn } from "~/lib/utils";
import FilterButtons, { type FilterButtonsProps } from "./FilterButtons";
import { PanelBodyRow, PanelBodySection } from "./PanelBody";
import { PanelOptionIconButton, type PanelOptionIconButtonProps } from "./PanelOptionGroup";
import Toggle from "./Toggle";

type PanelActionRowProps = {
  title: string;
  description?: string | null;
  actions: ReactNode;
  className?: string;
};

type PanelIconToggleRowProps = {
  title: string;
  description?: string | null;
  active: boolean;
  Icon: PanelOptionIconButtonProps["Icon"];
  emphasis?: PanelOptionIconButtonProps["emphasis"];
  onChange: (active: boolean) => void;
  className?: string;
};

type PanelSwitchRowProps = {
  title: string;
  description?: string | null;
  checked: boolean;
  disabled?: boolean;
  name?: string;
  onChange: (checked: boolean) => void;
  className?: string;
};

type PanelFilterButtonsSectionProps = FilterButtonsProps & {
  title: string;
  description?: string;
  className?: string;
};

type PanelFilterButtonRowProps = Omit<FilterButtonsProps, "surface">;

type PanelSearchFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  id?: string;
  name?: string;
  onChange: (value: string) => void;
  className?: string;
};

export function PanelActionRow({ title, description, actions, className }: PanelActionRowProps) {
  return (
    <PanelBodyRow title={title} description={description} className={className}>
      {actions}
    </PanelBodyRow>
  );
}

export function PanelIconToggleRow({
  title,
  description,
  active,
  Icon,
  emphasis,
  onChange,
  className,
}: PanelIconToggleRowProps) {
  return (
    <PanelActionRow
      title={title}
      description={description}
      className={className}
      actions={
        <PanelOptionIconButton
          label={title}
          active={active}
          emphasis={emphasis}
          Icon={Icon}
          onClick={() => onChange(!active)}
        />
      }
    />
  );
}

export function PanelSwitchRow({
  title,
  description,
  checked,
  disabled,
  name,
  onChange,
  className,
}: PanelSwitchRowProps) {
  return (
    <PanelActionRow
      title={title}
      description={description}
      className={cn("pt-3", className)}
      actions={
        <Toggle name={name} initialState={checked} disabled={disabled} className="m-0 shrink-0" onChange={onChange} />
      }
    />
  );
}

export function PanelFilterButtonsSection({
  title,
  description,
  className,
  ...filterButtonsProps
}: PanelFilterButtonsSectionProps) {
  return (
    <PanelBodySection title={title} className={className}>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <FilterButtons {...filterButtonsProps} />
    </PanelBodySection>
  );
}

export function PanelFilterButtonRow({
  buttonProps,
  className,
  buttonGroupClassName,
  ...props
}: PanelFilterButtonRowProps) {
  return (
    <FilterButtons
      {...props}
      buttonProps={buttonProps}
      surface="panel"
      className={cn("my-1 w-full", className)}
      buttonGroupClassName={cn("min-w-0 flex-1", buttonGroupClassName)}
    />
  );
}

export function PanelSearchField({ label, value, placeholder, id, name, onChange, className }: PanelSearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-muted-foreground" htmlFor={inputId}>
        {label}
      </label>
      <div className="mt-2 flex h-9 items-center rounded-md border border-input bg-background px-2 text-muted-foreground">
        <MagnifyingGlassIcon className="mr-2 size-4 shrink-0" />
        <input
          id={inputId}
          name={name}
          type="search"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
      </div>
    </div>
  );
}
