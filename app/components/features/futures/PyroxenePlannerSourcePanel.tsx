import { Cog6ToothIcon, EyeIcon, EyeSlashIcon, PlusIcon } from "@heroicons/react/16/solid";
import { type ElementType, useState } from "react";
import {
  BottomSheet,
  Button,
  FilterButtons,
  NumberInput,
  PanelActionRow,
  PanelBody,
  PanelBodySection,
  PanelOptionChip,
  PanelOptionIconButton,
} from "~/components/primitives";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/domain/pyroxene-planner";
import type { PyroxeneMonthlyPackageType } from "~/domain/pyroxene-sources";
import {
  calculateDailyApChargePyroxene,
  isPyroxeneTimelineSourceVisible,
  PYROXENE_AP_CHARGE_MAX_COUNT,
  togglePyroxeneTimelineSourceVisibility,
} from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import type { PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";
import AttendanceInput from "./planner-input/AttendanceInput";
import BuyInput from "./planner-input/BuyInput";
import PackageInput, { ApPackageInput } from "./planner-input/PackageInput";
import ResourcesInput from "./planner-input/ResourcesInput";
import { PYROXENE_SOURCE_ROW_DEFINITIONS, PYROXENE_SOURCE_ROW_GROUP_LABELS } from "./pyroxene-source-config";

type PyroxenePlannerSourcePanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
  onSaveBuy: (
    quantity: number,
    date: Date,
    options?: { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number },
  ) => void;
  onSaveMonthlyPackage: (startDate: Date, packageType: PyroxeneMonthlyPackageType, autoRepurchase: boolean) => void;
  onSaveApPackage: (startDate: Date, autoRepurchase: boolean) => void;
  onSaveAttendance: (startDate: Date) => void;
  onSaveOther: (resources: PickupResources, description: string, date: Date) => void;
  savingTimelineItem?: boolean;
};

const sourceGroupOrder = ["regular", "paid", "consumption"] as const;

const raidTierOptions = [
  { text: "플래티넘", value: "platinum" as const },
  { text: "골드", value: "gold" as const },
  { text: "실버", value: "silver" as const },
  { text: "브론즈", value: "bronze" as const },
];

const raidTierLabels: Record<PyroxenePlannerOptions["raid"]["tier"], string> = {
  platinum: "플래티넘",
  gold: "골드",
  silver: "실버",
  bronze: "브론즈",
};

const tacticalLevelOptions = [
  { text: "10위 내", value: "in10" as const },
  { text: "100위 내", value: "in100" as const },
  { text: "200위 내", value: "in200" as const },
  { text: "200위 밖", value: "over200" as const },
];

const tacticalLevelLabels: Record<PyroxenePlannerOptions["tactical"]["level"], string> = {
  in10: "10위 내",
  in100: "100위 내",
  in200: "200위 내",
  over200: "200위 밖",
};

export default function PyroxenePlannerSourcePanel({
  options,
  onOptionsChange,
  onSaveBuy,
  onSaveMonthlyPackage,
  onSaveApPackage,
  onSaveAttendance,
  onSaveOther,
  savingTimelineItem = false,
}: PyroxenePlannerSourcePanelProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const openRow = PYROXENE_SOURCE_ROW_DEFINITIONS.find((row) => row.id === openRowId) ?? null;

  const toggleSource = (sourceType: TimelineSourceType) => {
    onOptionsChange({
      ...options,
      timeline: {
        ...options.timeline,
        display: togglePyroxeneTimelineSourceVisibility(options.timeline.display, sourceType),
      },
    });
  };

  return (
    <>
      <PanelBody className="space-y-5 lg:space-y-4">
        {sourceGroupOrder.map((group) => {
          const rows = PYROXENE_SOURCE_ROW_DEFINITIONS.filter((row) => row.group === group);

          return (
            <PanelBodySection key={group} title={PYROXENE_SOURCE_ROW_GROUP_LABELS[group]}>
              <div className="space-y-0.5">
                {rows.map((row) => (
                  <PanelActionRow
                    key={row.id}
                    title={row.label}
                    description={getSelectedOptionText(row.id, options)}
                    className="rounded-md px-1.5 transition-colors hover:bg-muted/70"
                    actions={
                      <>
                        {row.action !== "none" && (
                          <IconButton
                            label={row.action === "add" ? `${row.label} 추가` : `${row.label} 설정`}
                            Icon={row.action === "add" ? PlusIcon : Cog6ToothIcon}
                            onClick={() => setOpenRowId(row.id)}
                          />
                        )}
                        {row.visibilityTargets.length === 1 ? (
                          <VisibilityButton
                            label={`${row.label} 타임라인 표시`}
                            visible={isPyroxeneTimelineSourceVisible(
                              options.timeline.display,
                              row.visibilityTargets[0].type,
                            )}
                            onClick={() => toggleSource(row.visibilityTargets[0].type)}
                          />
                        ) : (
                          <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
                            {row.visibilityTargets.map((target) => (
                              <VisibilityChip
                                key={target.type}
                                label={target.label ?? row.label}
                                visible={isPyroxeneTimelineSourceVisible(options.timeline.display, target.type)}
                                onClick={() => toggleSource(target.type)}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
            </PanelBodySection>
          );
        })}
      </PanelBody>

      {openRow && (
        <BottomSheet
          Icon={openRow.action === "add" ? PlusIcon : Cog6ToothIcon}
          title={openRow.label}
          onClose={() => setOpenRowId(null)}
        >
          <SourceSheetContent
            rowId={openRow.id}
            options={options}
            onOptionsChange={onOptionsChange}
            onClose={() => setOpenRowId(null)}
            onSaveBuy={(quantity, date, options) => {
              onSaveBuy(quantity, date, options);
              setOpenRowId(null);
            }}
            onSaveMonthlyPackage={(startDate, packageType, autoRepurchase) => {
              onSaveMonthlyPackage(startDate, packageType, autoRepurchase);
              setOpenRowId(null);
            }}
            onSaveApPackage={(startDate, autoRepurchase) => {
              onSaveApPackage(startDate, autoRepurchase);
              setOpenRowId(null);
            }}
            onSaveAttendance={(startDate) => {
              onSaveAttendance(startDate);
              setOpenRowId(null);
            }}
            onSaveOther={(resources, description, date) => {
              onSaveOther(resources, description, date);
              setOpenRowId(null);
            }}
            savingTimelineItem={savingTimelineItem}
          />
        </BottomSheet>
      )}
    </>
  );
}

function SourceSheetContent({
  rowId,
  options,
  onOptionsChange,
  onSaveBuy,
  onSaveMonthlyPackage,
  onSaveApPackage,
  onSaveAttendance,
  onSaveOther,
  onClose,
  savingTimelineItem,
}: PyroxenePlannerSourcePanelProps & { rowId: string; onClose: () => void }) {
  if (rowId === "buy") {
    return <BuyInput onSaveBuy={onSaveBuy} />;
  }

  if (rowId === "package") {
    return <PackageInput onSavePackage={onSaveMonthlyPackage} disabled={savingTimelineItem} />;
  }

  if (rowId === "ap_package") {
    return <ApPackageInput onSavePackage={onSaveApPackage} disabled={savingTimelineItem} />;
  }

  if (rowId === "attendance") {
    return <AttendanceInput onSaveAttendance={onSaveAttendance} disabled={savingTimelineItem} />;
  }

  if (rowId === "other") {
    return (
      <ResourcesInput
        onSaveResources={(resources, description, date) => {
          if (description === undefined || date === undefined) {
            return;
          }
          onSaveOther(resources, description, date);
        }}
        descriptionInput
        dateInput
        vertical
      />
    );
  }

  if (rowId === "raid") {
    return (
      <div>
        <p className="mb-2 text-sm text-muted-foreground">타임라인에 반영할 총력전/대결전 등급을 선택해주세요</p>
        <FilterButtons
          exclusive
          atLeastOne
          buttonProps={raidTierOptions.map(({ text, value }) => ({
            text,
            active: options.raid.tier === value,
            onToggle: () => onOptionsChange({ ...options, raid: { ...options.raid, tier: value } }),
          }))}
        />
      </div>
    );
  }

  if (rowId === "tactical") {
    return (
      <div>
        <p className="mb-2 text-sm text-muted-foreground">매일 보상 수령 시점의 대략적인 순위를 선택해주세요</p>
        <FilterButtons
          exclusive
          atLeastOne
          buttonProps={tacticalLevelOptions.map(({ text, value }) => ({
            text,
            active: options.tactical.level === value,
            onToggle: () => onOptionsChange({ ...options, tactical: { ...options.tactical, level: value } }),
          }))}
        />
      </div>
    );
  }

  if (rowId === "ap_charge") {
    return <ApChargeInput options={options} onOptionsChange={onOptionsChange} onClose={onClose} />;
  }

  return null;
}

function getSelectedOptionText(rowId: string, options: PyroxenePlannerOptions) {
  let text: string | null = null;
  if (rowId === "raid") {
    text = raidTierLabels[options.raid.tier];
  } else if (rowId === "tactical") {
    text = tacticalLevelLabels[options.tactical.level];
  } else if (rowId === "ap_charge") {
    text = options.consumption.apChargeCount === 0 ? "0회" : `매일 ${options.consumption.apChargeCount}회`;
  }

  return text;
}

function ApChargeInput({
  options,
  onOptionsChange,
  onClose,
}: {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
  onClose: () => void;
}) {
  const [apChargeCount, setApChargeCount] = useState(options.consumption.apChargeCount);
  const dailyPyroxene = calculateDailyApChargePyroxene(apChargeCount);

  const handleSave = () => {
    const display =
      apChargeCount > 0 && !options.timeline.display.includes("ap_charge")
        ? [...options.timeline.display, "ap_charge" as const]
        : options.timeline.display;

    onOptionsChange({
      ...options,
      consumption: { ...options.consumption, apChargeCount },
      timeline: { ...options.timeline, display },
    });
    onClose();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        매일 진행할 AP 충전 횟수를 선택해주세요. 0회로 두면 청휘석을 소비하지 않습니다.
      </p>
      <NumberInput
        label="충전 횟수"
        size="md"
        value={apChargeCount}
        minValue={0}
        maxValue={PYROXENE_AP_CHARGE_MAX_COUNT}
        showMin
        showMax
        onChange={setApChargeCount}
      />
      <p className="text-xs text-muted-foreground">매일 {dailyPyroxene.toLocaleString()}개 소비</p>
      <Button text="저장" variant="primary" fullWidth onClick={handleSave} />
    </div>
  );
}

function IconButton({ label, Icon, onClick }: { label: string; Icon: ElementType; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground lg:size-7"
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="size-4 lg:size-3.5" />
    </button>
  );
}

function VisibilityButton({ label, visible, onClick }: { label: string; visible: boolean; onClick: () => void }) {
  const Icon = visible ? EyeIcon : EyeSlashIcon;

  return <PanelOptionIconButton label={label} active={visible} Icon={Icon} onClick={onClick} />;
}

function VisibilityChip({ label, visible, onClick }: { label: string; visible: boolean; onClick: () => void }) {
  const Icon = visible ? EyeIcon : EyeSlashIcon;

  return <PanelOptionChip label={label} active={visible} Icon={Icon} onClick={onClick} />;
}
