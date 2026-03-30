import { useEffect, useState } from "react";
import type { PickupResources } from "..";
import { NumberInput, ResourceCard } from "~/components/primitives";
import PlannerButtonForm from "./PlannerButtonForm";
import PlannerInputForm from "./PlannerInputForm";
import PlannerFormGroup from "./PlannerFormGroup";
import { ResourceTypeEnum } from "~/graphql/graphql";
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
      <PlannerFormGroup>
        {dateInput && (
          <PlannerInputForm
            label="획득 날짜"
            type="date"
            defaultValue={dayjs(date).format("YYYY-MM-DD")}
            onChange={(value) => setDate(new Date(value))}
          />
        )}
        {descriptionInput && (
          <PlannerInputForm
            label="획득 사유"
            type="text"
            placeholder="20자 이하 (예: 점검 보상)"
            onChange={(value) => setDescriptionValue(value)}
            error={descriptionError}
          />
        )}
        <div>
          <label htmlFor={resourceGroupId} className="block text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-3">
            재화 수량
          </label>
          <div id={resourceGroupId} className={`${vertical ? "flex flex-col gap-4" : "grid grid-cols-1 md:grid-cols-3 gap-4"}`}>
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">
                <ResourceCard resourceType={ResourceTypeEnum.Currency} itemUid="2" />
              </div>
              <div className="flex-1 min-w-0">
                <NumberInput label="청휘석" value={resources.pyroxene} onChange={(value: number) => setResources((prev) => ({ ...prev, pyroxene: value }))} />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">
                <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid="6999" />
              </div>
              <div className="flex-1 min-w-0">
                <NumberInput label="10회 모집 티켓" value={resources.tenTimeTicket} onChange={(value: number) => setResources((prev) => ({ ...prev, tenTimeTicket: value }))} />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">
                <ResourceCard resourceType={ResourceTypeEnum.Item} itemUid="6998" />
              </div>
              <div className="flex-1 min-w-0">
                <NumberInput label="1회 모집 티켓" value={resources.oneTimeTicket} onChange={(value: number) => setResources((prev) => ({ ...prev, oneTimeTicket: value }))} />
              </div>
            </div>
          </div>
        </div>
        <PlannerButtonForm
          label="저장"
          color="blue"
          disabled={!!descriptionError}
          onClick={() => onSaveResources(resources, descriptionInput ? descriptionValue : undefined, dateInput ? date : undefined)}
        />
      </PlannerFormGroup>
    </>
  );
}
