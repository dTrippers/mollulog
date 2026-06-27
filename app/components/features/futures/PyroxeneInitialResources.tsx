import { Transition } from "@headlessui/react";
import { useEffect, useState } from "react";
import { Button, Checkbox, ResourceCard } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import ResourcesInput from "./planner-input/ResourcesInput";
import type { PyroxeneCollectedSourceCandidate } from "./types";

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
  collectedSourceCandidates: PyroxeneCollectedSourceCandidate[];
  onUpdateResources: (resources: PickupResources, collectedSourceKeys: string[]) => void;
};

export default function PyroxeneInitialResources({
  resources,
  collectedSourceCandidates,
  onUpdateResources,
}: PyroxeneInitialResourcesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedResources, setEditedResources] = useState<PickupResources>(resources);
  const [selectedCollectedSourceKeys, setSelectedCollectedSourceKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!isEditing) {
      setEditedResources(resources);
    }
  }, [resources, isEditing]);

  const handleCancel = () => {
    setEditedResources(resources);
    setSelectedCollectedSourceKeys([]);
    setIsEditing(false);
  };

  const handleToggleCollectedSource = (sourceKey: string, checked: boolean) => {
    setSelectedCollectedSourceKeys((prev) => {
      if (checked) {
        return prev.includes(sourceKey) ? prev : [...prev, sourceKey];
      }
      return prev.filter((key) => key !== sourceKey);
    });
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
              onUpdateResources(resources, selectedCollectedSourceKeys);
              setSelectedCollectedSourceKeys([]);
              setIsEditing(false);
            }}
          />
          {collectedSourceCandidates.length > 0 && (
            <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
              <p className="text-sm font-semibold">진행 중 보상 정합</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                이미 받아 현재 보유 재화에 포함된 보상만 체크해주세요. 체크한 항목은 그래프에서 중복 제외됩니다.
              </p>
              <div className="mt-3 space-y-2">
                {collectedSourceCandidates.map((candidate) => (
                  <Checkbox
                    key={candidate.sourceKey}
                    checked={selectedCollectedSourceKeys.includes(candidate.sourceKey)}
                    onChange={(checked) => handleToggleCollectedSource(candidate.sourceKey, checked)}
                    label={
                      <span className="flex flex-col">
                        <span className="font-medium">{candidate.title}</span>
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">{candidate.description}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Transition>
    </div>
  );
}
