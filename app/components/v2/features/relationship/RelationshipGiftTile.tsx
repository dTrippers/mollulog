import { useEffect, useRef, useState } from "react";
import type { StudentFavoriteGift } from "~/domain/relationship-gifts";
import { itemImageUrl, studentImageUrl } from "~/models/assets";
import type { NumberInputFlowNavigationInputProps } from "../../primitives/useNumberInputFlowNavigation";
import { NumberInput } from "../../primitives/NumberInput";
import { HoverTooltip } from "../../primitives/HoverTooltip";
import { Popover } from "../../primitives/Popover";

const rarityBackground: Record<number, string> = {
  1: "bg-v2-rarity-1",
  2: "bg-v2-rarity-2",
  3: "bg-v2-rarity-3",
  4: "bg-v2-rarity-4",
};

const formatNumber = (value: number) => value.toLocaleString("en-US");

export type GiftPlanBreakdownEntry = { studentUid: string; name: string; quantity: number };

export function RelationshipGiftTile({
  gift,
  quantity = 0,
  ownedMode = false,
  excludeOtherStudents = false,
  requiredQuantity = 0,
  ownedQuantity = 0,
  allocatedQuantity = 0,
  breakdown = [],
  showQuantityComparison = true,
  inputProps,
  disabled = false,
  onQuantityChange,
}: {
  gift: StudentFavoriteGift;
  quantity?: number;
  ownedMode?: boolean;
  excludeOtherStudents?: boolean;
  requiredQuantity?: number;
  ownedQuantity?: number;
  allocatedQuantity?: number;
  breakdown?: GiftPlanBreakdownEntry[];
  showQuantityComparison?: boolean;
  inputProps?: NumberInputFlowNavigationInputProps;
  disabled?: boolean;
  onQuantityChange?: (quantity: number) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const breakdownPinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    },
    [],
  );
  const showBreakdown = () => {
    cancelClose();
    if (breakdown.length > 0) setBreakdownOpen(true);
  };
  const closeBreakdown = () => {
    cancelClose();
    breakdownPinned.current = false;
    setBreakdownOpen(false);
  };
  const scheduleClose = () => {
    cancelClose();
    // Leave time to cross the gap between the required-quantity trigger and its portal.
    if (!breakdownPinned.current) closeTimer.current = setTimeout(() => setBreakdownOpen(false), 150);
  };
  const isInsufficient = requiredQuantity > ownedQuantity;
  const rarityClass = rarityBackground[gift.item.rarity] ?? rarityBackground[1];

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <HoverTooltip as="div" content={gift.item.name} focusable>
        <div className="relative flex size-13 items-center justify-center overflow-hidden rounded-lg md:size-16">
          <div aria-hidden="true" className={`absolute inset-0 ${rarityClass}`} />
          <img
            src={itemImageUrl(gift.item.uid)}
            alt={`${gift.item.name}, 희귀도 ${gift.item.rarity}`}
            loading="lazy"
            className="relative size-11 object-contain md:size-14"
          />
          <span className="absolute top-0 left-0 rounded-br-md bg-v2-scrim px-1 py-px text-xs leading-4 font-medium tabular-nums text-v2-on-media">
            {formatNumber(gift.exp)} EXP
          </span>
          <img
            src={`https://assets.mollulog.net/assets/images/ui/gift-reaction-${gift.favoriteLevel}.png`}
            alt={`선호 ${gift.favoriteLevel}단계`}
            loading="lazy"
            className="absolute -right-0.5 -bottom-0.5 size-6 object-contain"
          />
        </div>
      </HoverTooltip>
      {ownedMode ? (
        <>
          <span className="text-xs tabular-nums text-v2-fg-secondary">사용 {formatNumber(quantity)}</span>
          {excludeOtherStudents ? (
            <span className="mt-0.5 text-center text-xs leading-[1.125rem] tabular-nums text-v2-fg-tertiary">
              보유 {formatNumber(ownedQuantity)} · 다른 학생 {formatNumber(allocatedQuantity)}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <div className="w-full">
            <NumberInput
              size="sm"
              minValue={0}
              value={quantity}
              disabled={disabled}
              inputProps={{ "aria-label": `${gift.item.name} 수량`, ...inputProps }}
              onChange={onQuantityChange ?? (() => undefined)}
            />
          </div>
          {showQuantityComparison ? (
            <div className="mt-0.5 flex w-full min-w-0 flex-col items-center text-xs leading-[1.125rem]">
              <button
                ref={triggerRef}
                type="button"
                aria-expanded={breakdown.length > 0 ? breakdownOpen : undefined}
                onMouseEnter={showBreakdown}
                onMouseLeave={scheduleClose}
                onClick={() => {
                  if (breakdown.length === 0) return;
                  cancelClose();
                  breakdownPinned.current = !breakdownPinned.current;
                  setBreakdownOpen(breakdownPinned.current);
                }}
                className={`flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-1 text-left text-xs tabular-nums text-v2-fg-tertiary ${breakdown.length > 0 ? "cursor-help underline decoration-dotted underline-offset-2" : "cursor-default"}`}
              >
                <span>필요</span>
                <span className="ml-auto min-w-0 text-right [overflow-wrap:anywhere]">
                  {formatNumber(requiredQuantity)}
                </span>
              </button>
              <span className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-1 text-left">
                <span>보유</span>
                <span className="ml-auto min-w-0 text-right [overflow-wrap:anywhere]">
                  {formatNumber(ownedQuantity)}
                </span>
              </span>
              {isInsufficient ? <span className="self-center font-semibold text-v2-warning">부족</span> : null}
              <Popover
                open={breakdownOpen && breakdown.length > 0}
                label="필요한 학생별 선물 수량"
                onClose={closeBreakdown}
                onMouseEnter={showBreakdown}
                onMouseLeave={scheduleClose}
                returnFocusRef={triggerRef}
              >
                <p className="mb-2 text-sm font-semibold text-v2-fg">필요한 학생</p>
                <div className="space-y-1 text-sm">
                  {breakdown.map((entry) => (
                    <div key={entry.studentUid} className="flex items-center justify-between gap-4">
                      <span className="flex min-w-0 items-center gap-2">
                        <img
                          src={studentImageUrl(entry.studentUid)}
                          alt=""
                          loading="lazy"
                          className="size-6 shrink-0 rounded-md object-cover"
                        />
                        <span className="min-w-0 truncate text-v2-fg-secondary">{entry.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-v2-fg">{formatNumber(entry.quantity)}개</span>
                    </div>
                  ))}
                </div>
              </Popover>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
