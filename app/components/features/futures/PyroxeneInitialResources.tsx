import { Transition } from "@headlessui/react";
import { useEffect, useState } from "react";
import { Button, Checkbox, ResourceCard, SectionCard } from "~/components/primitives";
import type { PyroxeneCollectedSourceCandidate } from "~/domain/pyroxene-schedule";
import { PYROXENE_RESOURCE_UIDS } from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
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
      <SectionCard className="shadow-md dark:shadow-md">
        <div className="grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-center md:gap-x-4">
          {resourceItems.map(({ type, itemUid, label, resourceKey }) => (
            <div key={itemUid} className="flex min-w-0 items-center gap-2.5">
              <ResourceCard resourceType={type} itemUid={itemUid} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{resources[resourceKey].toLocaleString()}</p>
              </div>
            </div>
          ))}
          <div className="col-span-3 flex items-center justify-end gap-2 sm:col-span-1">
            {isEditing ? (
              <Button text="취소" variant="secondary" size="xs" onClick={handleCancel} />
            ) : (
              <Button text="수정" variant="secondary" size="xs" onClick={() => setIsEditing(true)} />
            )}
          </div>
        </div>
      </SectionCard>
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
        <div className="rounded-lg border border-border bg-popover/95 p-4 text-popover-foreground shadow-lg backdrop-blur-sm">
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
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-semibold">이미 받은 보상</p>
              <p className="mt-1 text-xs text-muted-foreground">
                이미 받은 보상이 있다면 중복 계산이 되지 않도록 선택해주세요.
              </p>
              <div className="mt-3 space-y-2">
                {collectedSourceCandidates.map((candidate) => {
                  const checked = selectedCollectedSourceKeys.includes(candidate.sourceKey);
                  return (
                    <Checkbox
                      key={candidate.sourceKey}
                      checked={checked}
                      onChange={(nextChecked) => handleToggleCollectedSource(candidate.sourceKey, nextChecked)}
                      className={cn(
                        "w-full items-start rounded-lg border px-4 py-3 transition-colors",
                        checked ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/50",
                      )}
                      aria-label={candidate.title}
                      label={
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">{candidate.title}</span>
                          {candidate.description && (
                            <span className="mt-0.5 block text-sm text-muted-foreground">{candidate.description}</span>
                          )}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Transition>
    </div>
  );
}
