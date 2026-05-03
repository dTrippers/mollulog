import { Cog6ToothIcon, EyeIcon, EyeSlashIcon, PlusIcon } from "@heroicons/react/16/solid";
import { useState, type ElementType } from "react";
import { BottomSheet, Button, FilterButtons, NumberInput } from "~/components/primitives";
import {
  calculateDailyApChargePyroxene,
  PYROXENE_SOURCE_ROW_DEFINITIONS,
  PYROXENE_SOURCE_ROW_GROUP_LABELS,
  isPyroxeneTimelineSourceVisible,
  togglePyroxeneTimelineSourceVisibility,
} from "~/models/pyroxene-sources";
import { PYROXENE_AP_CHARGE_MAX_COUNT } from "~/models/pyroxene-planner-source-config";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/models/pyroxene-planner";
import type { PickupResources } from "~/models/pyroxene-timeline";
import { cn } from "~/lib/utils";
import AttendanceInput from "./planner-input/AttendanceInput";
import BuyInput from "./planner-input/BuyInput";
import PackageInput from "./planner-input/PackageInput";
import ResourcesInput from "./planner-input/ResourcesInput";

type PyroxenePlannerSourcePanelProps = {
  options: PyroxenePlannerOptions;
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
  onSaveBuy: (quantity: number, date: Date) => void;
  onSavePackage: (startDate: Date, packageType: "half" | "full") => void;
  onSaveAttendance: (startDate: Date) => void;
  onSaveOther: (resources: PickupResources, description: string, date: Date) => void;
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
  onSavePackage,
  onSaveAttendance,
  onSaveOther,
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
      <div className="space-y-5 lg:space-y-3">
        {sourceGroupOrder.map((group) => {
          const rows = PYROXENE_SOURCE_ROW_DEFINITIONS.filter((row) => row.group === group);

          return (
            <section key={group} className="space-y-2 lg:space-y-1.5">
              <h3 className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
                {PYROXENE_SOURCE_ROW_GROUP_LABELS[group]}
              </h3>
              <div className="space-y-1 rounded-lg border border-neutral-200/80 p-1 dark:border-neutral-700/80">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-md px-2 py-1 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-700/70"
                  >
                    <div
                      className="flex min-h-8 items-center gap-2 lg:min-h-7 lg:gap-1.5"
                    >
                      <div className="min-w-0 grow">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{row.label}</p>
                        <SelectedOptionText rowId={row.id} options={options} />
                      </div>
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
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

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
            onSaveBuy={(quantity, date) => {
              onSaveBuy(quantity, date);
              setOpenRowId(null);
            }}
            onSavePackage={(startDate, packageType) => {
              onSavePackage(startDate, packageType);
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
  onSavePackage,
  onSaveAttendance,
  onSaveOther,
  onClose,
}: PyroxenePlannerSourcePanelProps & { rowId: string; onClose: () => void }) {
  if (rowId === "buy") {
    return <BuyInput onSaveBuy={onSaveBuy} />;
  }

  if (rowId === "package") {
    return <PackageInput onSavePackage={onSavePackage} />;
  }

  if (rowId === "attendance") {
    return <AttendanceInput onSaveAttendance={onSaveAttendance} />;
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
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          타임라인에 반영할 총력전/대결전 등급을 선택해주세요
        </p>
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
        <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          매일 보상 수령 시점의 대략적인 순위를 선택해주세요
        </p>
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

function SelectedOptionText({ rowId, options }: { rowId: string; options: PyroxenePlannerOptions }) {
  let text: string | null = null;
  if (rowId === "raid") {
    text = raidTierLabels[options.raid.tier];
  } else if (rowId === "tactical") {
    text = tacticalLevelLabels[options.tactical.level];
  } else if (rowId === "ap_charge") {
    text = options.consumption.apChargeCount === 0 ? "0회" : `매일 ${options.consumption.apChargeCount}회`;
  }

  if (!text) {
    return null;
  }

  return <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{text}</p>;
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
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        매일 진행할 AP 충전 횟수를 선택해주세요. 0회로 두면 청휘석을 소비하지 않습니다.
      </p>
      <NumberInput
        label="충전 횟수"
        size="sm"
        value={apChargeCount}
        minValue={0}
        maxValue={PYROXENE_AP_CHARGE_MAX_COUNT}
        showMin
        showMax
        onChange={setApChargeCount}
      />
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        매일 {dailyPyroxene.toLocaleString()}개 소비
      </p>
      <Button text="저장" variant="tint-blue" fullWidth onClick={handleSave} />
    </div>
  );
}

function IconButton({ label, Icon, onClick }: { label: string; Icon: ElementType; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 lg:size-7"
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="size-4 lg:size-3.5" />
    </button>
  );
}

function VisibilityButton({ label, visible, onClick }: { label: string; visible: boolean; onClick: () => void }) {
  const Icon = visible ? EyeIcon : EyeSlashIcon;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border transition lg:size-7",
        visible
          ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
          : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700",
      )}
      aria-label={label}
      aria-pressed={visible}
      onClick={onClick}
    >
      <Icon className="size-4 lg:size-3.5" />
    </button>
  );
}

function VisibilityChip({ label, visible, onClick }: { label: string; visible: boolean; onClick: () => void }) {
  const Icon = visible ? EyeIcon : EyeSlashIcon;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1 rounded-sm border px-2 text-xs font-medium transition lg:h-7 lg:px-1.5",
        visible
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
          : "border-neutral-200 bg-neutral-100/70 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700",
      )}
      aria-pressed={visible}
      onClick={onClick}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}
