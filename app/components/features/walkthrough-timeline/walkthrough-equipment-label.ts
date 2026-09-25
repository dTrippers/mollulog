import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";

export function getWalkthroughEquipmentLabel(equipments: readonly string[] | undefined, index: number) {
  const equipmentType = equipments?.[index];
  return equipmentType ? (EQUIPMENT_TYPE_LABELS[equipmentType] ?? "장비 정보 없음") : "장비 정보 없음";
}
