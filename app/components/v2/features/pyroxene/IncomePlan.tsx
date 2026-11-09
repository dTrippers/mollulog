import { Cog6ToothIcon, EyeIcon, EyeSlashIcon, PlusIcon, TrashIcon } from "@heroicons/react/16/solid";
import { type ElementType, useEffect, useId, useMemo, useState } from "react";
import { formatPlannerPeriodRangeParts, plannerPeriodRangeLabel } from "~/domain/integrated-planner";
import type { PyroxenePlannerOptions, TimelineSourceType } from "~/domain/pyroxene-planner";
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
import { Switch } from "../../primitives/Switch";
import { SegmentedChoice } from "./PickupBasis";
import {
  FieldLabel,
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

type IncomeDialog = "ap" | "attendance" | "raid" | "tactical" | null;

const ROW_ACTION_CLASS_NAME =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md text-xs font-semibold";

/** A filled square that opens a row's settings (gear) or adds an entry (plus). */
function RowAction({ icon: Icon, label, onClick }: { icon: ElementType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        ROW_ACTION_CLASS_NAME,
        "w-8 bg-v2-inset text-v2-fg-secondary hover:bg-v2-filled-hover hover:text-v2-fg",
        v2FocusRing,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/** Shows or hides a source in the schedule. Hidden sources still count in the calculation. */
function VisibilityToggle({
  label,
  text,
  visible,
  onToggle,
}: {
  label: string;
  text?: string;
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? EyeIcon : EyeSlashIcon;
  return (
    <button
      type="button"
      aria-label={`${label} 일정에 표시`}
      title={`${label} 일정에 표시`}
      aria-pressed={visible}
      onClick={onToggle}
      className={cn(
        ROW_ACTION_CLASS_NAME,
        text ? "px-2" : "w-8",
        visible
          ? "bg-v2-accent-subtle text-v2-accent hover:bg-v2-accent-subtle/80"
          : "bg-v2-inset text-v2-fg-secondary hover:bg-v2-filled-hover hover:text-v2-fg",
        v2FocusRing,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {text}
    </button>
  );
}

function SourceRow({
  label,
  detail,
  actions,
  children,
}: {
  label: string;
  detail?: React.ReactNode;
  actions: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col py-1.5">
      <div className="flex min-h-8 items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-v2-fg">{label}</span>
          {detail ? <span className="block text-xs text-v2-fg-tertiary tabular-nums">{detail}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1">{actions}</span>
      </div>
      {children}
    </div>
  );
}

function PlanGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col">
      <h3 className="pb-0.5 text-xs font-medium text-v2-fg-tertiary">{label}</h3>
      {children}
    </section>
  );
}

/** Packages bought within their active window, under the row that adds them. */
function ActivePackageList({
  packages,
  onDelete,
}: {
  packages: ActivePyroxenePackage[];
  onDelete: (uid: string) => void;
}) {
  if (packages.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1 border-l-2 border-v2-divider pl-3" aria-label="적용 중인 패키지">
      {packages.map((item) => (
        <li key={item.uid} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs">
            <span className="text-v2-fg-secondary">{item.name}</span>
            <span className="ml-1.5 text-v2-fg-tertiary tabular-nums">
              {dayjs(item.date).tz(KST).format("MM/DD")}~ · {item.activeDays}일
            </span>
          </span>
          <IconButton icon={TrashIcon} label={`${item.name} 삭제`} onClick={() => onDelete(item.uid)} />
        </li>
      ))}
    </ul>
  );
}

export function IncomePlanPanel({
  options,
  activePackages,
  attendanceStart,
  saving,
  handlers,
  onAdd,
}: {
  options: PyroxenePlannerOptions;
  activePackages: ActivePyroxenePackage[];
  attendanceStart: Date | null;
  saving: boolean;
  handlers: IncomePlanHandlers;
  onAdd: (tab: AddTab) => void;
}) {
  const [dialog, setDialog] = useState<IncomeDialog>(null);
  const exceptionCount = options.consumption.apChargeExceptions.length;
  const display = options.timeline.display;
  const visibility = (type: TimelineSourceType, label: string, text?: string) => (
    <VisibilityToggle
      label={label}
      text={text}
      visible={display.includes(type)}
      onToggle={() =>
        handlers.onOptionsChange({
          ...options,
          timeline: {
            ...options.timeline,
            display: display.includes(type) ? display.filter((item) => item !== type) : [...display, type],
          },
        })
      }
    />
  );
  const raidLabel = raidTierOptions.find((option) => option.value === options.raid.tier)?.label;
  const tacticalLabel = tacticalLevelOptions.find((option) => option.value === options.tactical.level)?.label;
  const monthlyPackages = activePackages.filter((item) => item.source === "package_onetime");
  const apPackages = activePackages.filter((item) => item.source === "package_ap");

  return (
    <div className="flex flex-col gap-3">
      <PlanGroup label="수급">
        <SourceRow label="이벤트/스토리 보상" actions={visibility("event_reward", "이벤트/스토리 보상")} />
        <SourceRow
          label="총력전·대결전"
          detail={raidLabel}
          actions={
            <>
              <RowAction icon={Cog6ToothIcon} label="총력전·대결전 설정" onClick={() => setDialog("raid")} />
              {visibility("raid", "총력전·대결전 보상")}
            </>
          }
        />
        <SourceRow
          label="임무"
          actions={
            <>
              {visibility("daily_mission", "일일 임무", "일일")}
              {visibility("weekly_mission", "주간 임무", "주간")}
            </>
          }
        />
        <SourceRow
          label="전술대회"
          detail={tacticalLabel}
          actions={
            <>
              <RowAction icon={Cog6ToothIcon} label="전술대회 설정" onClick={() => setDialog("tactical")} />
              {visibility("tactical", "전술대회 보상")}
            </>
          }
        />
        <SourceRow
          label="출석"
          detail={attendanceStart ? `${dayjs(attendanceStart).tz(KST).format("MM/DD")}~` : "설정 안 함"}
          actions={
            <>
              <RowAction icon={Cog6ToothIcon} label="출석 설정" onClick={() => setDialog("attendance")} />
              {visibility("attendance", "출석")}
            </>
          }
        />
        <SourceRow
          label="청휘석 구매"
          actions={
            <>
              <RowAction icon={PlusIcon} label="청휘석 구매 추가" onClick={() => onAdd("buy")} />
              {visibility("buy", "청휘석 구매")}
            </>
          }
        />
        <SourceRow
          label="직접 등록"
          actions={
            <>
              <RowAction icon={PlusIcon} label="직접 등록 추가" onClick={() => onAdd("other")} />
              {visibility("other", "직접 등록")}
            </>
          }
        />
      </PlanGroup>
      <PlanGroup label="소비">
        <SourceRow
          label="AP 충전"
          detail={
            options.consumption.apChargeCount > 0
              ? `하루 ${options.consumption.apChargeCount}회${exceptionCount > 0 ? ` · 예외 ${exceptionCount}` : ""}`
              : "안 함"
          }
          actions={
            <>
              <RowAction icon={Cog6ToothIcon} label="AP 충전 설정" onClick={() => setDialog("ap")} />
              {visibility("ap_charge", "AP 충전")}
            </>
          }
        />
      </PlanGroup>
      <PlanGroup label="반복 구매">
        <SourceRow
          label="청휘석 패키지"
          actions={
            <>
              <RowAction icon={PlusIcon} label="청휘석 패키지 추가" onClick={() => onAdd("monthly")} />
              {visibility("package_onetime", "청휘석 패키지 초회", "초회")}
              {visibility("package_daily", "청휘석 패키지 일간", "일간")}
            </>
          }
        >
          <ActivePackageList packages={monthlyPackages} onDelete={handlers.onDeleteItem} />
        </SourceRow>
        <SourceRow
          label="AP 패키지"
          actions={
            <>
              <RowAction icon={PlusIcon} label="AP 패키지 추가" onClick={() => onAdd("ap")} />
              {visibility("package_ap", "AP 패키지")}
            </>
          }
        >
          <ActivePackageList packages={apPackages} onDelete={handlers.onDeleteItem} />
        </SourceRow>
      </PlanGroup>
      <p className="text-xs text-v2-fg-tertiary">일정에서 숨긴 항목도 계산에는 들어가요.</p>
      <ChoiceDialog
        open={dialog === "raid"}
        title="총력전·대결전"
        label="총력전·대결전 등급"
        options={raidTierOptions}
        value={options.raid.tier}
        onClose={() => setDialog(null)}
        onChange={(tier) => {
          handlers.onOptionsChange({ ...options, raid: { tier } });
          setDialog(null);
        }}
      />
      <ChoiceDialog
        open={dialog === "tactical"}
        title="전술대회"
        label="전술대회 순위"
        options={tacticalLevelOptions}
        value={options.tactical.level}
        onClose={() => setDialog(null)}
        onChange={(level) => {
          handlers.onOptionsChange({ ...options, tactical: { level } });
          setDialog(null);
        }}
      />
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
    </div>
  );
}

/** One choice that applies as soon as it is picked. */
function ChoiceDialog<T extends string>({
  open,
  title,
  label,
  options,
  value,
  onClose,
  onChange,
}: {
  open: boolean;
  title: string;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onClose: () => void;
  onChange: (value: T) => void;
}) {
  return (
    <PlannerDialog open={open} title={title} onClose={onClose}>
      <SegmentedChoice label={label} variant="tiles" options={[...options]} value={value} onChange={onChange} />
    </PlannerDialog>
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

export type AddTab = "buy" | "monthly" | "ap" | "other";

const addTabs: { id: AddTab; label: string }[] = [
  { id: "buy", label: "청휘석 구매" },
  { id: "monthly", label: "청휘석 패키지" },
  { id: "ap", label: "AP 패키지" },
  { id: "other", label: "직접 등록" },
];

/** Rendered by the route so a closing panel sheet cannot remount and reopen it. */
export function AddIncomeDialog({
  tab,
  onClose,
  saving,
  handlers,
}: {
  // The kind to add, chosen by the panel row that opened the dialog; null while closed.
  tab: AddTab | null;
  onClose: () => void;
  saving: boolean;
  handlers: IncomePlanHandlers;
}) {
  const open = tab !== null;
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
      title={`${addTabs.find((item) => item.id === tab)?.label ?? ""} 추가`}
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
