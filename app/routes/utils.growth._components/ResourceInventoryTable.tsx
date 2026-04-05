import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { NumberInput, ResourceCard } from "~/components/primitives";
import {
  EQUIPMENT_TYPE_LABELS,
  GROWTH_RESOURCE_KIND_LABELS,
  getEquipmentTier,
  getEquipmentTypeKey,
  getResourceKindOrder,
  type GrowthResourceItem,
} from "~/models/growth-resource";

type ActionResult = {
  success?: boolean;
  error?: string;
};

type ResourceInventoryTableProps = {
  items: GrowthResourceItem[];
  ownedQuantities: Record<string, number>;
};

const groupContainerClass = "rounded-xl border border-neutral-200 bg-white/80 dark:border-neutral-800 dark:bg-neutral-950/80";

function OwnedQuantityCell({
  itemUid,
  quantity,
  savedQuantity,
  onQuantityChange,
}: {
  itemUid: string;
  quantity: number;
  savedQuantity: number;
  onQuantityChange: (quantity: number) => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<number | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || submittedRef.current == null) {
      return;
    }

    submittedRef.current = null;

    if (fetcher.data?.success) {
      setError(null);
      return;
    }

    if (fetcher.data?.error) {
      onQuantityChange(savedQuantity);
      setError(fetcher.data.error);
    }
  }, [fetcher.data, fetcher.state, onQuantityChange, savedQuantity]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const scheduleSave = (nextQuantity: number) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      submittedRef.current = nextQuantity;
      setError(null);
      fetcher.submit(
        { itemUid, quantity: nextQuantity },
        { method: "post", encType: "application/json" },
      );
    }, 500);
  };

  return (
    <div className="space-y-0.5">
      <p className="text-xs text-neutral-400 dark:text-neutral-500">보유</p>
      <NumberInput
        minValue={0}
        showDecrease={false}
        showIncrease={false}
        compact
        value={quantity}
        onChange={(value) => {
          onQuantityChange(value);
          scheduleSave(value);
        }}
      />
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

function ItemColumn({
  item,
  owned,
  savedOwned,
  onOwnedQuantityChange,
}: {
  item: GrowthResourceItem;
  owned: number;
  savedOwned: number;
  onOwnedQuantityChange: (quantity: number) => void;
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
      <OwnedQuantityCell
        itemUid={item.uid}
        quantity={owned}
        savedQuantity={savedOwned}
        onQuantityChange={onOwnedQuantityChange}
      />
      {deficit > 0 ? (
        <p className="text-xs font-semibold text-red-500 dark:text-red-400">
          {deficit.toLocaleString()}
        </p>
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
  savedOwnedQuantities,
  onOwnedQuantityChange,
}: {
  items: GrowthResourceItem[];
  ownedQuantities: Record<string, number>;
  savedOwnedQuantities: Record<string, number>;
  onOwnedQuantityChange: (itemUid: string, quantity: number) => void;
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
    return EQUIPMENT_TYPE_ORDER
      .filter((key) => grouped.has(key))
      .map((key) => {
        const typeItems = (grouped.get(key) as GrowthResourceItem[])
          .slice()
          .sort((a, b) => getEquipmentTier(b.uid) - getEquipmentTier(a.uid));
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
              <ItemColumn
                key={item.uid}
                item={item}
                owned={ownedQuantities[item.uid] ?? 0}
                savedOwned={savedOwnedQuantities[item.uid] ?? 0}
                onOwnedQuantityChange={(quantity) => onOwnedQuantityChange(item.uid, quantity)}
              />
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
  savedOwnedQuantities,
  onOwnedQuantityChange,
}: {
  kindOrder: number;
  items: GrowthResourceItem[];
  ownedQuantities: Record<string, number>;
  savedOwnedQuantities: Record<string, number>;
  onOwnedQuantityChange: (itemUid: string, quantity: number) => void;
}) {
  return (
    <section className={groupContainerClass}>
      <div className="rounded-t-xl border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {GROWTH_RESOURCE_KIND_LABELS[kindOrder] ?? "기타"}
        </h2>
      </div>

      {kindOrder === 6 ? (
        <EquipmentSubGroups
          items={items}
          ownedQuantities={ownedQuantities}
          savedOwnedQuantities={savedOwnedQuantities}
          onOwnedQuantityChange={onOwnedQuantityChange}
        />
      ) : (
        <div className="flex flex-wrap gap-x-1 gap-y-0 px-3">
          {items.map((item) => (
            <ItemColumn
              key={item.uid}
              item={item}
              owned={ownedQuantities[item.uid] ?? 0}
              savedOwned={savedOwnedQuantities[item.uid] ?? 0}
              onOwnedQuantityChange={(quantity) => onOwnedQuantityChange(item.uid, quantity)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function ResourceInventoryTable({ items, ownedQuantities }: ResourceInventoryTableProps) {
  const [draftOwnedQuantities, setDraftOwnedQuantities] = useState(ownedQuantities);
  const previousOwnedQuantitiesRef = useRef(ownedQuantities);

  useEffect(() => {
    setDraftOwnedQuantities((currentQuantities) => {
      const nextQuantities = { ...currentQuantities };

      for (const item of items) {
        const previousSavedQuantity = previousOwnedQuantitiesRef.current[item.uid] ?? 0;
        const currentDraftQuantity = currentQuantities[item.uid] ?? 0;

        if (currentDraftQuantity === previousSavedQuantity) {
          nextQuantities[item.uid] = ownedQuantities[item.uid] ?? 0;
        }
      }

      return nextQuantities;
    });
    previousOwnedQuantitiesRef.current = ownedQuantities;
  }, [items, ownedQuantities]);

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

    return Array.from(grouped.entries()).sort(([a], [b]) => a - b);
  }, [items]);

  const handleOwnedQuantityChange = (itemUid: string, quantity: number) => {
    setDraftOwnedQuantities((currentQuantities) => ({
      ...currentQuantities,
      [itemUid]: quantity,
    }));
  };

  return (
    <div className="space-y-5">
      {groups.map(([kindOrder, groupItems]) => (
        <ResourceGroupTable
          key={kindOrder}
          kindOrder={kindOrder}
          items={groupItems}
          ownedQuantities={draftOwnedQuantities}
          savedOwnedQuantities={ownedQuantities}
          onOwnedQuantityChange={handleOwnedQuantityChange}
        />
      ))}
    </div>
  );
}
