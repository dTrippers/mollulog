import { PanelBody, PanelFilterButtonsSection, PanelSearchField } from "~/components/primitives";

export const RESOURCE_INVENTORY_RARITY_OPTIONS = [
  { value: 1, label: "N", color: "grey" },
  { value: 2, label: "R", color: "blue" },
  { value: 3, label: "SR", color: "orange" },
  { value: 4, label: "SSR", color: "purple" },
] as const;

export type ResourceInventoryFilterState = {
  search: string;
  rarities: number[];
  shortageOnly?: boolean;
};

export function createResourceInventoryFilterState(): ResourceInventoryFilterState {
  return {
    search: "",
    rarities: [],
    shortageOnly: false,
  };
}

export type ResourceInventoryFilterable = {
  name: string;
  rarity: number;
  shortage?: boolean;
};

export function matchesResourceInventoryFilter(
  resource: ResourceInventoryFilterable,
  filter: ResourceInventoryFilterState,
): boolean {
  const search = filter.search.trim().toLowerCase();
  if (search && !resource.name.toLowerCase().includes(search)) {
    return false;
  }
  if (filter.rarities.length > 0 && !filter.rarities.includes(resource.rarity)) {
    return false;
  }
  if (filter.shortageOnly && resource.shortage !== true) {
    return false;
  }
  return true;
}

export function filterResourceInventoryResources<T extends ResourceInventoryFilterable>(
  resources: T[],
  filter: ResourceInventoryFilterState,
): T[] {
  return resources.filter((resource) => matchesResourceInventoryFilter(resource, filter));
}

export function isResourceInventoryFilterActive(filter: ResourceInventoryFilterState): boolean {
  return filter.search.trim().length > 0 || filter.rarities.length > 0 || filter.shortageOnly === true;
}

type ResourceInventoryFilterPanelProps = {
  value: ResourceInventoryFilterState;
  onChange: (value: ResourceInventoryFilterState) => void;
};

export default function ResourceInventoryFilterPanel({ value, onChange }: ResourceInventoryFilterPanelProps) {
  return (
    <PanelBody className="space-y-2">
      <PanelSearchField
        label="이름으로 찾기"
        value={value.search}
        placeholder="재화 이름"
        className="pt-1"
        onChange={(search) => onChange({ ...value, search })}
      />
      <PanelFilterButtonsSection
        title="등급"
        buttonProps={RESOURCE_INVENTORY_RARITY_OPTIONS.map(({ value: rarity, label, color }) => ({
          text: label,
          color,
          active: value.rarities.includes(rarity),
          onToggle: (activated: boolean) => {
            const rarities = activated
              ? [...value.rarities, rarity]
              : value.rarities.filter((currentRarity) => currentRarity !== rarity);
            onChange({ ...value, rarities });
          },
        }))}
        size="sm"
      />
      <PanelFilterButtonsSection
        title="보유 상태"
        buttonProps={[
          {
            text: "부족 재화만",
            active: value.shortageOnly,
            onToggle: (shortageOnly: boolean) => onChange({ ...value, shortageOnly }),
          },
        ]}
        size="sm"
      />
    </PanelBody>
  );
}
