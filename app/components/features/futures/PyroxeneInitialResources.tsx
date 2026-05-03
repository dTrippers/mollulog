import { Transition } from "@headlessui/react";
import { useEffect, useState } from "react";
import { Button, ResourceCard } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { PYROXENE_RESOURCE_UIDS } from "~/models/pyroxene-planner-source-config";
import type { PickupResources } from "~/models/pyroxene-timeline";
import ResourcesInput from "./planner-input/ResourcesInput";

const resourceItems = [
  {
    type: ResourceTypeEnum.Currency,
    itemUid: PYROXENE_RESOURCE_UIDS.pyroxene,
    label: "청휘석",
    resourceKey: "pyroxene" as const,
  },
  {
    type: ResourceTypeEnum.Item,
    itemUid: PYROXENE_RESOURCE_UIDS.tenTimeTicket,
    label: "10회 모집 티켓",
    resourceKey: "tenTimeTicket" as const,
  },
  {
    type: ResourceTypeEnum.Item,
    itemUid: PYROXENE_RESOURCE_UIDS.oneTimeTicket,
    label: "1회 모집 티켓",
    resourceKey: "oneTimeTicket" as const,
  },
];

type PyroxeneInitialResourcesProps = {
  resources: PickupResources;
  onUpdateResources: (resources: PickupResources) => void;
};

export default function PyroxeneInitialResources({ resources, onUpdateResources }: PyroxeneInitialResourcesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedResources, setEditedResources] = useState<PickupResources>(resources);

  useEffect(() => {
    if (!isEditing) {
      setEditedResources(resources);
    }
  }, [resources, isEditing]);

  const handleCancel = () => {
    setEditedResources(resources);
    setIsEditing(false);
  };

  return (
    <div className="relative">
      <div className="my-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {resourceItems.map(({ type, itemUid, label, resourceKey }) => (
            <div key={itemUid} className="flex items-start gap-2">
              <ResourceCard resourceType={type} itemUid={itemUid} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="my-1 text-sm">{resources[resourceKey].toLocaleString()}</p>
              </div>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-end gap-2">
            {isEditing ? (
              <Button text="취소" variant="tint" size="xs" onClick={handleCancel} />
            ) : (
              <Button text="수정" variant="tint-blue" size="xs" onClick={() => setIsEditing(true)} />
            )}
          </div>
        </div>
      </div>
      <Transition
        show={isEditing}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="absolute top-full left-0 z-10 mt-2 w-full"
      >
        <div className="rounded-lg border border-neutral-200 bg-white/90 p-4 shadow-lg backdrop-blur-sm dark:border-neutral-700 dark:bg-black/80">
          <ResourcesInput
            description="현재 보유한 재화 수량을 입력해주세요."
            initialResources={editedResources}
            onSaveResources={(resources) => {
              onUpdateResources(resources);
              setIsEditing(false);
            }}
          />
        </div>
      </Transition>
    </div>
  );
}
