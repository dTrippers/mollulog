import { useEffect, useState } from "react";
import type { PickupResources } from "..";
import { Button, Field, Input, NumberInput, ResourceCard } from "~/components/primitives";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { PYROXENE_RESOURCE_UIDS } from "~/models/pyroxene-planner-source-config";
import dayjs from "dayjs";

type ResourcesInputProps = {
  description?: string;
  onSaveResources: (resources: PickupResources, description?: string, date?: Date) => void;

  descriptionInput?: boolean;
  dateInput?: boolean;
  vertical?: boolean;
  initialResources?: PickupResources;
};

export default function ResourcesInput({ description, onSaveResources, descriptionInput, dateInput, vertical, initialResources }: ResourcesInputProps) {
  const resourceGroupId = "resource-amounts";
  const [resources, setResources] = useState<PickupResources>(initialResources ?? {
    pyroxene: 0,
    oneTimeTicket: 0,
    tenTimeTicket: 0,
  });

  useEffect(() => {
    if (initialResources) {
      setResources(initialResources);
    }
  }, [initialResources]);

  const [descriptionValue, setDescriptionValue] = useState<string>(description ?? "");
  const [date, setDate] = useState<Date>(new Date());
  
  const descriptionError = descriptionInput && descriptionValue.length > 20
    ? "획득 사유는 20자 이하여야 해요"
    : undefined;

  return (
    <>
      {description && <p className="mb-4 text-sm text-neutral-500">{description}</p>}
      <div className="space-y-4">
        {dateInput && (
          <Input
            label="획득 날짜"
            type="date"
            size="sm"
            defaultValue={dayjs(date).format("YYYY-MM-DD")}
            onChange={(value) => setDate(new Date(value))}
          />
        )}
        {descriptionInput && (
          <Input
            label="획득 사유"
            type="text"
            size="sm"
            placeholder="20자 이하 (예: 점검 보상)"
            onChange={(value) => setDescriptionValue(value)}
            error={descriptionError}
          />
        )}
        <Field label="재화 수량" htmlFor={resourceGroupId}>
          <div id={resourceGroupId} className={`${vertical ? "flex flex-col gap-4" : "grid grid-cols-1 md:grid-cols-3 gap-4"}`}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">
                <ResourceCard resourceType={ResourceTypeEnum.Currency} itemUid={PYROXENE_RESOURCE_UIDS.pyroxene} />
              </div>
              <div className="flex-1 min-w-0">
                <NumberInput size="sm" label="청휘석" value={resources.pyroxene} onChange={(value: number) => setResources((prev) => ({ ...prev, pyroxene: value }))} />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">
                <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid={PYROXENE_RESOURCE_UIDS.tenTimeTicket} />
              </div>
              <div className="flex-1 min-w-0">
                <NumberInput size="sm" label="10회 모집 티켓" value={resources.tenTimeTicket} onChange={(value: number) => setResources((prev) => ({ ...prev, tenTimeTicket: value }))} />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">
                <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid={PYROXENE_RESOURCE_UIDS.oneTimeTicket} />
              </div>
              <div className="flex-1 min-w-0">
                <NumberInput size="sm" label="1회 모집 티켓" value={resources.oneTimeTicket} onChange={(value: number) => setResources((prev) => ({ ...prev, oneTimeTicket: value }))} />
              </div>
            </div>
          </div>
        </Field>
        <Button
          text="저장"
          variant="tint-blue"
          fullWidth
          className="mt-2"
          disabled={!!descriptionError}
          onClick={() => onSaveResources(resources, descriptionInput ? descriptionValue : undefined, dateInput ? date : undefined)}
        />
      </div>
    </>
  );
}
