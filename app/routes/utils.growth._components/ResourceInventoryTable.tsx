import { useMemo } from "react";
import { ResourceCard } from "~/components/primitives";
import {
  EQUIPMENT_TYPE_LABELS,
  GROWTH_RESOURCE_KIND_LABELS,
  GROWTH_RESOURCE_KIND_ORDER,
  compareGrowthResourceKindOrder,
  getEquipmentTier,
  getEquipmentTypeKey,
  getResourceKindOrder,
  type GrowthResourceItem,
} from "~/models/growth-resource";

type ResourceInventoryTableProps = {
  items: GrowthResourceItem[];
  ownedQuantities: Record<string, number>;
};

const groupContainerClass =
  "rounded-xl border border-neutral-200 bg-white/80 dark:border-neutral-800 dark:bg-neutral-950/80";

function ItemColumn({
  item,
  owned,
}: {
  item: GrowthResourceItem;
  owned: number;
}) {
  const deficit = item.amount - owned;

  const tier = item.source === "equipment" ? getEquipmentTier(item.uid) : null;

  return (
    <div className="flex w-16 flex-col items-center gap-1.5 py-2">
      <ResourceCard
        itemUid={item.uid}
        resourceType={item.type}
        rarity={item.rarity}
        label={item.amount.toLocaleString()}
        name={tier !== null ? `${item.name ?? item.uid} (T${tier})` : item.name}
        size="md"
      />
      <div className="space-y-0.5 text-center">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">보유</p>
        <p className="text-sm font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">
          {owned.toLocaleString()}
        </p>
      </div>
      {deficit > 0 ? (
        <p className="text-xs font-semibold text-red-500 dark:text-red-400">{deficit.toLocaleString()}</p>
      ) : (
        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">충분</p>
      )}
    </div>
  );
}

const EQUIPMENT_TYPE_ORDER = ["hat", "gloves", "shoes", "bag", "badge", "hairpin", "charm", "watch", "necklace"];

function EquipmentSubGroups({
  items,
  ownedQuantities,
}: {
  items: GrowthResourceItem[];
  ownedQuantities: Record<string, number>;
}) {
  const subGroups = useMemo(() => {
    const grouped = new Map<string, GrowthResourceItem[]>();
    for (const item of items) {
      const typeKey = getEquipmentTypeKey(item.uid) ?? "기타";
      const current = grouped.get(typeKey);
      if (current) {
        current.push(item);
      } else {
        grouped.set(typeKey, [item]);
      }
    }
    return EQUIPMENT_TYPE_ORDER.filter((key) => grouped.has(key)).map((key) => {
      const typeItems = (grouped.get(key) as GrowthResourceItem[])
        .slice()
        .sort((a, b) => getEquipmentTier(a.uid) - getEquipmentTier(b.uid));
      return [key, typeItems] as const;
    });
  }, [items]);

  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {subGroups.map(([typeKey, typeItems]) => (
        <div key={typeKey} className="px-3 py-2">
          <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {EQUIPMENT_TYPE_LABELS[typeKey] ?? typeKey}
          </p>
          <div className="flex flex-wrap gap-x-1 gap-y-0">
            {typeItems.map((item) => (
              <ItemColumn key={item.uid} item={item} owned={ownedQuantities[item.uid] ?? 0} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResourceGroupTable({
  kindOrder,
  items,
  ownedQuantities,
}: {
  kindOrder: number;
  items: GrowthResourceItem[];
  ownedQuantities: Record<string, number>;
}) {
  return (
    <section className={groupContainerClass}>
      <div className="rounded-t-xl border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {GROWTH_RESOURCE_KIND_LABELS[kindOrder] ?? "기타"}
        </h2>
      </div>

      {kindOrder === GROWTH_RESOURCE_KIND_ORDER.equipment ? (
        <EquipmentSubGroups items={items} ownedQuantities={ownedQuantities} />
      ) : (
        <div className="flex flex-wrap gap-x-1 gap-y-0 px-3">
          {items.map((item) => (
            <ItemColumn key={item.uid} item={item} owned={ownedQuantities[item.uid] ?? 0} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ResourceInventoryTable({ items, ownedQuantities }: ResourceInventoryTableProps) {
  const groups = useMemo(() => {
    const grouped = new Map<number, GrowthResourceItem[]>();

    for (const item of items) {
      const kindOrder = getResourceKindOrder(item);
      const currentGroup = grouped.get(kindOrder);
      if (currentGroup) {
        currentGroup.push(item);
        continue;
      }

      grouped.set(kindOrder, [item]);
    }

    return Array.from(grouped.entries()).sort(([a], [b]) => compareGrowthResourceKindOrder(a, b));
  }, [items]);

  return (
    <div className="space-y-5">
      {groups.map(([kindOrder, groupItems]) => (
        <ResourceGroupTable
          key={kindOrder}
          kindOrder={kindOrder}
          items={groupItems}
          ownedQuantities={ownedQuantities}
        />
      ))}
    </div>
  );
}
