import { ChevronRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/16/solid";
import { useEffect, useId, useMemo, useState } from "react";
import { formatPlannerPeriodRangeParts, plannerPeriodRangeLabel } from "~/domain/integrated-planner";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import type { ActivePyroxenePackage } from "~/domain/pyroxene-planner-view";
import {
  calculateDailyApChargePyroxene,
  calculatePackageStartDateFromRemainingDays,
  DEFAULT_BUY_PYROXENE_QUANTITY,
  PYROXENE_AP_CHARGE_MAX_COUNT,
  PYROXENE_AP_PACKAGE_CONFIG,
  PYROXENE_BUY_PRESET_GROUPS,
  PYROXENE_MONTHLY_PACKAGE_CONFIG,
  type PyroxeneMonthlyPackageType,
} from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { cn } from "~/lib/utils";
import type { PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { IconButton } from "../../primitives/IconButton";
import { NumberInput } from "../../primitives/NumberInput";
import { SectionTabs } from "../../primitives/SectionTabs";
import { Select } from "../../primitives/Select";
import { Switch } from "../../primitives/Switch";
import { SegmentedChoice } from "./PickupBasis";
import {
  FieldLabel,
  formatSigned,
  PlannerDialog,
  PYROXENE_RESOURCE_LABELS,
  type PyroxeneResourceKey,
  ResourceIcon,
  v2TextInputClassName,
} from "./pyroxene-ui";

const KST = "Asia/Seoul";

const raidTierOptions = [
  { value: "platinum", label: "플래티넘" },
  { value: "gold", label: "골드" },
  { value: "silver", label: "실버" },
  { value: "bronze", label: "브론즈" },
] as const;

const tacticalLevelOptions = [
  { value: "in10", label: "10위 내" },
  { value: "in100", label: "100위 내" },
  { value: "in200", label: "200위 내" },
  { value: "over200", label: "200위 밖" },
] as const;

export function formatApChargeExceptionPeriod(startDate: string, endDate: string): string {
  const startAt = dayjs.tz(`${startDate}T04:00:00`, KST).toISOString();
  const endAt = dayjs.tz(`${endDate}T04:00:00`, KST).add(1, "day").toISOString();
  const parts = formatPlannerPeriodRangeParts(startAt, endAt, KST);
  if (!parts) throw new Error("기간별 AP 충전 예외를 확인할 수 없어요.");
  return plannerPeriodRangeLabel(parts);
}

export type IncomePlanHandlers = {
  onOptionsChange: (options: PyroxenePlannerOptions) => void;
  onRemoveApChargeException: (uid: string) => void;
  onDeleteItem: (itemUid: string) => void;
  onSaveBuy: (
    quantity: number,
    date: Date,
    options?: { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number },
  ) => void;
  onSaveMonthlyPackage: (startDate: Date, packageType: PyroxeneMonthlyPackageType, autoRepurchase: boolean) => void;
  onSaveApPackage: (startDate: Date, autoRepurchase: boolean) => void;
  onSaveAttendance: (startDate: Date) => void;
  onSaveOther: (resources: PickupResources, description: string, date: Date) => void;
};

type IncomeDialog = "ap" | "attendance" | "add" | null;

function PlanRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 text-sm">
      <span className="shrink-0 text-v2-fg">{label}</span>
      {children}
    </div>
  );
}

function RowButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-7 min-w-0 cursor-pointer items-center gap-1 rounded-md bg-v2-inset pr-1.5 pl-3 text-xs text-v2-fg tabular-nums hover:bg-v2-filled-hover",
        v2FocusRing,
      )}
    >
      <span className="truncate">{children}</span>
      <ChevronRightIcon className="size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
    </button>
  );
}

export function IncomePlanAddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick}>
      <PlusIcon className="size-3.5" aria-hidden="true" />
      추가
    </Button>
  );
}

export function IncomePlanPanel({
  options,
  activePackages,
  attendanceStart,
  addRequest,
  saving,
  handlers,
}: {
  options: PyroxenePlannerOptions;
  activePackages: ActivePyroxenePackage[];
  attendanceStart: Date | null;
  // Increments when the panel header's add button is pressed.
  addRequest: number;
  saving: boolean;
  handlers: IncomePlanHandlers;
}) {
  const [dialog, setDialog] = useState<IncomeDialog>(null);
  useEffect(() => {
    if (addRequest > 0) setDialog("add");
  }, [addRequest]);
  const exceptionCount = options.consumption.apChargeExceptions.length;

  return (
    <div className="flex flex-col gap-1">
      <PlanRow label="임무">
        <span className="text-xs text-v2-fg-secondary tabular-nums">매일 +20 · 매주 +120</span>
      </PlanRow>
      <PlanRow label="총력전·대결전">
        <Select
          label="총력전·대결전 등급"
          value={options.raid.tier}
          options={raidTierOptions}
          onChange={(tier) => handlers.onOptionsChange({ ...options, raid: { tier } })}
        />
      </PlanRow>
      <PlanRow label="전술대회">
        <Select
          label="전술대회 순위"
          value={options.tactical.level}
          options={tacticalLevelOptions}
          onChange={(level) => handlers.onOptionsChange({ ...options, tactical: { level } })}
        />
      </PlanRow>
      <PlanRow label="AP 충전">
        <RowButton label="AP 충전 설정" onClick={() => setDialog("ap")}>
          {options.consumption.apChargeCount > 0 ? `하루 ${options.consumption.apChargeCount}회` : "안 함"}
          {exceptionCount > 0 ? ` · 예외 ${exceptionCount}` : ""}
        </RowButton>
      </PlanRow>
      <PlanRow label="출석">
        <RowButton label="출석 설정" onClick={() => setDialog("attendance")}>
          {attendanceStart ? `${dayjs(attendanceStart).tz(KST).format("MM/DD")}~` : "설정 안 함"}
        </RowButton>
      </PlanRow>
      {activePackages.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1 border-t border-v2-divider pt-2" aria-label="적용 중인 패키지">
          {activePackages.map((item) => (
            <li key={item.uid} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-v2-fg">{item.description}</span>
                <span className="block text-xs text-v2-fg-tertiary tabular-nums">
                  {dayjs(item.date).tz(KST).format("MM/DD")}~ · {item.activeDays}일
                </span>
              </span>
              <span className="text-xs text-v2-fg-secondary tabular-nums">{formatSigned(item.pyroxeneDelta)}</span>
              <IconButton
                icon={TrashIcon}
                label={`${item.description} 삭제`}
                onClick={() => handlers.onDeleteItem(item.uid)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <ApChargeDialog
        open={dialog === "ap"}
        options={options}
        onClose={() => setDialog(null)}
        onSave={(count) => {
          const display =
            count > 0 && !options.timeline.display.includes("ap_charge")
              ? [...options.timeline.display, "ap_charge" as const]
              : options.timeline.display;
          handlers.onOptionsChange({
            ...options,
            consumption: { ...options.consumption, apChargeCount: count },
            timeline: { ...options.timeline, display },
          });
          setDialog(null);
        }}
        onRemoveException={handlers.onRemoveApChargeException}
      />
      <AttendanceDialog
        open={dialog === "attendance"}
        onClose={() => setDialog(null)}
        onSave={(date) => {
          handlers.onSaveAttendance(date);
          setDialog(null);
        }}
        saving={saving}
      />
      <AddIncomeDialog open={dialog === "add"} onClose={() => setDialog(null)} saving={saving} handlers={handlers} />
    </div>
  );
}

function ApChargeDialog({
  open,
  options,
  onClose,
  onSave,
  onRemoveException,
}: {
  open: boolean;
  options: PyroxenePlannerOptions;
  onClose: () => void;
  onSave: (count: number) => void;
  onRemoveException: (uid: string) => void;
}) {
  const [count, setCount] = useState(options.consumption.apChargeCount);
  const inputId = useId();
  useEffect(() => {
    if (open) setCount(options.consumption.apChargeCount);
  }, [open, options.consumption.apChargeCount]);

  return (
    <PlannerDialog
      open={open}
      title="AP 충전"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => onSave(count)}>
            저장
          </Button>
        </>
      }
    >
      <p className="text-sm text-v2-fg-secondary">매일 청휘석으로 AP를 충전하는 횟수예요. 0회면 소비하지 않아요.</p>
      <div className="flex items-center gap-3">
        <FieldLabel htmlFor={inputId}>하루 충전 횟수</FieldLabel>
        <div className="ml-auto w-40">
          <NumberInput
            id={inputId}
            grouped
            showMax
            min={0}
            max={PYROXENE_AP_CHARGE_MAX_COUNT}
            value={count}
            aria-label="하루 충전 횟수"
            onValueChange={setCount}
          />
        </div>
      </div>
      <p className="text-xs text-v2-fg-secondary tabular-nums">
        매일 청휘석 {calculateDailyApChargePyroxene(count).toLocaleString()}개 소비
      </p>
      {options.consumption.apChargeExceptions.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-v2-fg-secondary">기간별 예외</h3>
          <ul className="flex flex-col gap-1">
            {options.consumption.apChargeExceptions.map((exception) => {
              const period = formatApChargeExceptionPeriod(exception.startDate, exception.endDate);
              return (
                <li
                  key={exception.uid}
                  className="flex items-center gap-2 rounded-md bg-v2-inset py-1 pr-1 pl-3 text-sm"
                >
                  <span className="min-w-0 flex-1 tabular-nums">
                    {period} · 매일 {exception.count}회
                  </span>
                  <IconButton
                    icon={TrashIcon}
                    label={`${period} 예외 삭제`}
                    onClick={() => onRemoveException(exception.uid)}
                  />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-v2-fg-tertiary">기간별 예외는 AP 플래너에서 추가할 수 있어요.</p>
        </section>
      ) : null}
    </PlannerDialog>
  );
}

function DateField({ label, value, onChange }: { label: string; value: Date; onChange: (date: Date) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        type="date"
        className={cn(v2TextInputClassName, v2FocusRing)}
        value={dayjs(value).tz(KST).format("YYYY-MM-DD")}
        onChange={(event) => {
          if (event.currentTarget.value) onChange(dayjs.tz(`${event.currentTarget.value}T00:00:00`, KST).toDate());
        }}
      />
    </div>
  );
}

function AttendanceDialog({
  open,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (date: Date) => void;
  saving: boolean;
}) {
  const [date, setDate] = useState(() => new Date());
  return (
    <PlannerDialog
      open={open}
      title="출석"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={saving} onClick={() => onSave(date)}>
            저장
          </Button>
        </>
      }
    >
      <p className="text-sm text-v2-fg-secondary">
        출석 1일차 날짜를 입력해주세요. 5일차에 50개, 10일차에 100개를 받아요. 저장하면 기존 출석 계획을 바꿔요.
      </p>
      <DateField label="출석 1일차" value={date} onChange={setDate} />
    </PlannerDialog>
  );
}

type AddTab = "buy" | "monthly" | "ap" | "other";

const addTabs: { id: AddTab; label: string }[] = [
  { id: "buy", label: "청휘석 구매" },
  { id: "monthly", label: "월정액" },
  { id: "ap", label: "AP 패키지" },
  { id: "other", label: "기타" },
];

function AddIncomeDialog({
  open,
  onClose,
  saving,
  handlers,
}: {
  open: boolean;
  onClose: () => void;
  saving: boolean;
  handlers: IncomePlanHandlers;
}) {
  const [tab, setTab] = useState<AddTab>("buy");
  const [buy, setBuy] = useState({
    quantity: DEFAULT_BUY_PYROXENE_QUANTITY,
    date: new Date(),
    monthly: false,
    monthlyCount: 1,
  });
  const [monthly, setMonthly] = useState<{
    type: PyroxeneMonthlyPackageType;
    startDate: Date;
    autoRepurchase: boolean;
  }>({ type: "full", startDate: new Date(), autoRepurchase: false });
  const [ap, setAp] = useState({ startDate: new Date(), autoRepurchase: false });
  const [other, setOther] = useState({
    resources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 } as PickupResources,
    description: "",
    date: new Date(),
  });
  const idPrefix = useId();
  const otherDescriptionError = other.description.length > 20 ? "획득 사유는 20자 이하로 입력해주세요" : null;
  const otherEmpty =
    other.resources.pyroxene === 0 && other.resources.oneTimeTicket === 0 && other.resources.tenTimeTicket === 0;

  const submit = () => {
    if (tab === "buy") {
      handlers.onSaveBuy(
        buy.quantity,
        buy.date,
        buy.monthly ? { repeatType: "monthly_first", monthlyCount: buy.monthlyCount } : undefined,
      );
    } else if (tab === "monthly") {
      handlers.onSaveMonthlyPackage(monthly.startDate, monthly.type, monthly.autoRepurchase);
    } else if (tab === "ap") {
      handlers.onSaveApPackage(ap.startDate, ap.autoRepurchase);
    } else {
      handlers.onSaveOther(other.resources, other.description, other.date);
    }
    onClose();
  };

  return (
    <PlannerDialog
      open={open}
      title="수급 추가"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={saving || (tab === "other" && (!!otherDescriptionError || otherEmpty))}
            onClick={submit}
          >
            추가
          </Button>
        </>
      }
    >
      <SectionTabs label="수급 종류" items={addTabs} selectedId={tab} onChange={(id) => setTab(id as AddTab)} />
      {tab === "buy" ? (
        <>
          <DateField label="구매 날짜" value={buy.date} onChange={(date) => setBuy((v) => ({ ...v, date }))} />
          <BuyPresetPicker value={buy.quantity} onChange={(quantity) => setBuy((v) => ({ ...v, quantity }))} />
          <Switch
            id={`${idPrefix}-monthly`}
            checked={buy.monthly}
            onCheckedChange={(monthlyRepeat) => setBuy((v) => ({ ...v, monthly: monthlyRepeat }))}
            label="매월 반복 구매"
          />
          {buy.monthly ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <FieldLabel htmlFor={`${idPrefix}-count`}>월 구매 횟수</FieldLabel>
                <div className="ml-auto w-36">
                  <NumberInput
                    id={`${idPrefix}-count`}
                    grouped
                    min={1}
                    value={buy.monthlyCount}
                    aria-label="월 구매 횟수"
                    onValueChange={(value) => setBuy((v) => ({ ...v, monthlyCount: Math.max(1, Math.floor(value)) }))}
                  />
                </div>
              </div>
              <p className="text-xs text-v2-fg-tertiary tabular-nums">
                입력한 날짜에 {(buy.quantity * buy.monthlyCount).toLocaleString()}개를 반영하고, 다음 달부터 매월 1일에
                같은 수량을 반영해요.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
      {tab === "monthly" ? (
        <>
          <SegmentedChoice
            label="패키지 종류"
            options={[
              { value: "full" as const, label: `월간 (+${PYROXENE_MONTHLY_PACKAGE_CONFIG.full.oneTime})` },
              { value: "half" as const, label: `하프 (+${PYROXENE_MONTHLY_PACKAGE_CONFIG.half.oneTime})` },
            ]}
            value={monthly.type}
            onChange={(type) => setMonthly((v) => ({ ...v, type }))}
          />
          <PackageStartInput
            key={monthly.type}
            durationDays={PYROXENE_MONTHLY_PACKAGE_CONFIG[monthly.type].repurchaseIntervalDays}
            value={monthly.startDate}
            onChange={(startDate) => setMonthly((v) => ({ ...v, startDate }))}
          />
          <Checkbox
            id={`${idPrefix}-monthly-repurchase`}
            checked={monthly.autoRepurchase}
            onCheckedChange={(autoRepurchase) => setMonthly((v) => ({ ...v, autoRepurchase }))}
          >
            만료 후 자동으로 다시 구매
          </Checkbox>
        </>
      ) : null}
      {tab === "ap" ? (
        <>
          <p className="text-sm text-v2-fg-secondary">
            구매 즉시 청휘석 {PYROXENE_AP_PACKAGE_CONFIG.oneTime}개를 받아요.
          </p>
          <PackageStartInput
            durationDays={PYROXENE_AP_PACKAGE_CONFIG.repurchaseIntervalDays}
            value={ap.startDate}
            onChange={(startDate) => setAp((v) => ({ ...v, startDate }))}
          />
          <Checkbox
            id={`${idPrefix}-ap-repurchase`}
            checked={ap.autoRepurchase}
            onCheckedChange={(autoRepurchase) => setAp((v) => ({ ...v, autoRepurchase }))}
          >
            만료 후 자동으로 다시 구매
          </Checkbox>
        </>
      ) : null}
      {tab === "other" ? (
        <>
          <DateField label="획득 날짜" value={other.date} onChange={(date) => setOther((v) => ({ ...v, date }))} />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor={`${idPrefix}-description`}>획득 사유</FieldLabel>
            <input
              id={`${idPrefix}-description`}
              type="text"
              placeholder="20자 이하 (예: 점검 보상)"
              value={other.description}
              aria-invalid={otherDescriptionError ? true : undefined}
              aria-describedby={otherDescriptionError ? `${idPrefix}-description-error` : undefined}
              onChange={(event) => setOther((v) => ({ ...v, description: event.currentTarget.value }))}
              className={cn(v2TextInputClassName, v2FocusRing, "aria-invalid:border-v2-danger")}
            />
            {otherDescriptionError ? (
              <p id={`${idPrefix}-description-error`} role="alert" className="text-xs text-v2-danger">
                {otherDescriptionError}
              </p>
            ) : null}
          </div>
          {(["pyroxene", "tenTimeTicket", "oneTimeTicket"] as PyroxeneResourceKey[]).map((key) => (
            <div key={key} className="flex items-center gap-3">
              <ResourceIcon resource={key} className="size-6" />
              <label htmlFor={`${idPrefix}-${key}`} className="min-w-0 flex-1 text-sm text-v2-fg">
                {PYROXENE_RESOURCE_LABELS[key]}
              </label>
              <div className="w-40">
                <NumberInput
                  id={`${idPrefix}-${key}`}
                  grouped
                  formatThousands
                  min={0}
                  value={other.resources[key]}
                  aria-label={PYROXENE_RESOURCE_LABELS[key]}
                  onValueChange={(value) => setOther((v) => ({ ...v, resources: { ...v.resources, [key]: value } }))}
                />
              </div>
            </div>
          ))}
        </>
      ) : null}
    </PlannerDialog>
  );
}

function BuyPresetPicker({ value, onChange }: { value: number; onChange: (quantity: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  const presets = useMemo(
    () =>
      PYROXENE_BUY_PRESET_GROUPS.flatMap((group) =>
        group.presets.map((preset) => ({ ...preset, limited: group.id === "limited" })),
      ),
    [],
  );
  const visible = showAll ? presets : presets.slice(0, 3);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-v2-fg-secondary">구매 상품</span>
      <div className="grid grid-cols-3 gap-1.5">
        {visible.map((preset) => {
          const selected = value === preset.quantity;
          return (
            <button
              key={`${preset.limited ? "limited" : "regular"}-${preset.quantity}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(preset.quantity)}
              className={cn(
                "flex cursor-pointer flex-col items-start rounded-md px-2.5 py-1.5 text-left",
                selected ? "bg-v2-selected text-v2-on-selected" : "bg-v2-inset text-v2-fg hover:bg-v2-filled-hover",
                v2FocusRing,
              )}
            >
              <span className="text-sm font-semibold tabular-nums">{preset.quantity.toLocaleString()}개</span>
              <span className="text-xs opacity-80 tabular-nums">
                {preset.price}
                {preset.limited ? " · 한정" : ""}
              </span>
            </button>
          );
        })}
      </div>
      {!showAll ? (
        <Button variant="text" size="sm" onClick={() => setShowAll(true)}>
          다른 상품 더 보기
        </Button>
      ) : null}
    </div>
  );
}

function PackageStartInput({
  durationDays,
  value,
  onChange,
}: {
  durationDays: number;
  value: Date;
  onChange: (date: Date) => void;
}) {
  const [mode, setMode] = useState<"date" | "remaining">("date");
  const [remaining, setRemaining] = useState(durationDays - 1);
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <SegmentedChoice
        label="시작 날짜 입력 방식"
        options={[
          { value: "date" as const, label: "시작 날짜" },
          { value: "remaining" as const, label: "남은 일수" },
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          if (next === "remaining") onChange(calculatePackageStartDateFromRemainingDays(remaining, durationDays));
        }}
      />
      {mode === "date" ? (
        <DateField label="패키지 시작 날짜" value={value} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <FieldLabel htmlFor={id}>적용 효과 남은 일수</FieldLabel>
            <div className="ml-auto w-36">
              <NumberInput
                id={id}
                grouped
                showMax
                min={0}
                max={durationDays - 1}
                value={remaining}
                aria-label="적용 효과 남은 일수"
                onValueChange={(days) => {
                  setRemaining(days);
                  onChange(calculatePackageStartDateFromRemainingDays(days, durationDays));
                }}
              />
            </div>
          </div>
          <p className="text-xs text-v2-fg-tertiary tabular-nums">
            {dayjs(value).tz(KST).format("MM/DD")}에 시작한 것으로 계산해요
          </p>
        </div>
      )}
    </div>
  );
}
