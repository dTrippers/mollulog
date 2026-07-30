import { Transition } from "@headlessui/react";
import { CheckIcon, HeartIcon, MinusIcon, StarIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { AttributeBadge } from "~/components/primitives";
import { useStudentCardPopup } from "~/contexts/StudentCardPopupProvider";
import type { Attack, Defense } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  roleColor,
  roleLocale,
} from "~/locales/ko";
import { studentImageUrl } from "~/models/assets";
import type { Role } from "~/models/content.d";
import { parseVisibleNames } from "~/models/student";

type StudentCardProps = {
  uid: string | null;
  name?: string | null;
  nameSize?: "small" | "normal";
  namePlacement?: "below" | "overlay";
  hideNameOnMobile?: boolean;

  tier?: number | null;
  level?: number | null;
  label?: ReactNode;
  labelPlacement?: "default" | "top-right";
  isAssist?: boolean;
  attackType?: Attack;
  defenseType?: Defense;
  role?: Role;

  favorited?: boolean;
  favoritedCount?: number;
  completed?: boolean;
  grayscale?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  selectionStyle?: "check" | "ring";
  hideName?: boolean;
  circular?: boolean;
  flush?: boolean;

  onSelect?: (id: string) => void;
  popups?: StudentCardPopupProps["popups"];
  popupId?: string | null;
};

const popupWidth = 288;
const popupEstimatedHeight = 220;
const popupMargin = 16;
const popupGap = 8;

type PopupPosition = {
  left: number;
  top: number;
};

function visibileTier(tier: number): [number, boolean] {
  if (tier <= 5) {
    return [tier, false];
  }
  return [tier - 5, true];
}

function getStudentCardAction({
  uid,
  onSelect,
  popupId,
  activePopupId,
  setActivePopupId,
}: {
  uid: string | null;
  onSelect?: (id: string) => void;
  popupId: string | null;
  activePopupId: string | null;
  setActivePopupId: (id: string | null) => void;
}) {
  if (!uid && (!popupId || onSelect)) {
    return undefined;
  }

  return () => {
    if (onSelect) {
      if (uid) {
        onSelect(uid);
      }
      return;
    }

    setActivePopupId(popupId === activePopupId ? null : popupId);
  };
}

function StudentCardFrame({
  interactive,
  onClick,
  children,
}: {
  interactive: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = interactive ? "block w-full hover:scale-105 transition text-left cursor-pointer" : "";

  if (!interactive) {
    return <div>{children}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  );
}

export default function StudentCard({
  uid,
  name,
  nameSize,
  namePlacement = "below",
  hideNameOnMobile = false,
  tier,
  level,
  label,
  labelPlacement = "default",
  isAssist,
  attackType,
  defenseType,
  role,
  favorited,
  favoritedCount,
  completed,
  grayscale,
  checked,
  indeterminate,
  selectionStyle = "check",
  hideName,
  circular,
  flush = false,
  onSelect,
  popups,
  popupId = uid,
}: StudentCardProps) {
  const { activePopupId, setActivePopupId } = useStudentCardPopup();
  const showPopup = popupId === activePopupId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [canUsePopupPortal, setCanUsePopupPortal] = useState(false);
  const [usesMobilePopupLayout, setUsesMobilePopupLayout] = useState(false);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);
  const interactive = Boolean(onSelect ? uid : popups && popupId);
  const handleCardClick = getStudentCardAction({
    uid,
    onSelect,
    popupId,
    activePopupId,
    setActivePopupId,
  });

  useEffect(() => {
    setCanUsePopupPortal(true);
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updatePopupLayout = () => setUsesMobilePopupLayout(mediaQuery.matches);
    updatePopupLayout();
    mediaQuery.addEventListener("change", updatePopupLayout);

    return () => mediaQuery.removeEventListener("change", updatePopupLayout);
  }, []);

  useEffect(() => {
    if (!showPopup) {
      return;
    }

    const updatePopupPosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      if (rect.width === 0 || rect.height === 0) {
        setPopupPosition(null);
        return;
      }

      if (usesMobilePopupLayout) {
        setPopupPosition({ left: 0, top: 0 });
        return;
      }

      const maxLeft = Math.max(popupMargin, window.innerWidth - popupWidth - popupMargin);
      const bottomTop = rect.bottom + popupGap;
      const top =
        bottomTop + popupEstimatedHeight > window.innerHeight - popupMargin
          ? Math.max(popupMargin, rect.top - popupEstimatedHeight - popupGap)
          : bottomTop;
      setPopupPosition({
        left: Math.min(Math.max(rect.left, popupMargin), maxLeft),
        top,
      });
    };

    updatePopupPosition();
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [showPopup, usesMobilePopupLayout]);

  const visibleNames = parseVisibleNames(name ?? "");
  const showName = Boolean(name && !hideName);
  const showsOverlayName = showName && namePlacement === "overlay";
  const showsTopRightLabel = Boolean(label && (showsOverlayName || labelPlacement === "top-right"));
  const selectionRingClass =
    selectionStyle === "ring"
      ? checked
        ? "ring-2 ring-inset ring-primary"
        : indeterminate
          ? "ring-2 ring-inset ring-primary/50"
          : ""
      : "";
  const showTier = typeof tier === "number" && tier > 0;
  const overlaySubName = visibleNames.length === 2 ? visibleNames[1] : "";
  const overlayMainName = visibleNames[0] ?? name;
  const cardAspectClassName = circular ? "aspect-square" : showsOverlayName ? "aspect-5/6" : "";
  const showPositionedPopup = showPopup && popupPosition !== null;
  const statusBadgeColorClass = completed
    ? "bg-green-600/90 text-white"
    : favorited === undefined || favorited === true
      ? "bg-red-500/90 text-white"
      : "bg-neutral-900/80 text-white";
  const popupStyle: CSSProperties | undefined = usesMobilePopupLayout
    ? undefined
    : {
        left: popupPosition?.left,
        top: popupPosition?.top,
        maxHeight: "calc(100vh - 2rem)",
      };
  const popup = (uid || popupId) && name && popups && popups.length > 0 && (
    <Transition
      show={showPositionedPopup}
      as="div"
      enter="transition duration-200 ease-out"
      enterFrom="opacity-0 scale-95"
      enterTo="scale-100"
      leave="transition duration-100 ease-in"
      leaveFrom="scale-100"
      leaveTo="opacity-0 scale-95"
      className={`fixed left-0 bottom-4 w-full min-w-72 overflow-y-auto whitespace-nowrap z-layer-modal md:bottom-auto md:w-auto ${
        !usesMobilePopupLayout && !popupPosition ? "md:invisible" : ""
      }`}
      style={popupStyle}
    >
      <StudentCardPopup
        student={{ uid, name, attackType, defenseType, role }}
        popups={popups}
        onClose={() => setActivePopupId(null)}
      />
    </Transition>
  );

  return (
    <div ref={rootRef} className="relative">
      <StudentCardFrame interactive={interactive} onClick={handleCardClick}>
        <div className={flush ? "" : "my-1"}>
          <div className="relative">
            <div
              className={`relative ${circular ? "rounded-full" : "rounded-lg"} overflow-hidden ${cardAspectClassName} ${selectionRingClass}`}
            >
              <img
                className={`w-full h-full object-cover ${grayscale ? "grayscale opacity-75" : ""} transition`}
                src={studentImageUrl(uid ?? "unlisted")}
                alt={name ?? undefined}
                loading="lazy"
              />
              <div className="absolute top-0.5 right-0.5 flex origin-top-right scale-80 flex-col items-end gap-0.5 text-xs font-bold">
                {level && <span className="px-1.5 bg-neutral-900/90 rounded-lg text-neutral-100">Lv. {level}</span>}
                {showsTopRightLabel && (
                  <span className="px-1.5 py-0.5 rounded-md bg-black/70 text-white backdrop-blur-sm leading-tight">
                    {label}
                  </span>
                )}
                {showsOverlayName && !label && showTier && (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 rounded-md bg-black/70 backdrop-blur-sm leading-tight ${visibileTier(tier)[1] ? "text-teal-300" : "text-yellow-300"}`}
                  >
                    {tier <= 5 ? (
                      <StarIcon className="size-3 shrink-0" />
                    ) : (
                      <img className="size-3.5 shrink-0" src="/icons/exclusive_weapon.png" alt="고유 장비" />
                    )}
                    <span>{visibileTier(tier)[0]}</span>
                  </span>
                )}
              </div>

              {showsOverlayName && isAssist && (
                <div className="absolute top-0.5 left-0.5 px-1 md:px-1.5 rounded-md text-xs font-bold bg-linear-to-br from-cyan-300 to-sky-500 dark:from-cyan-400 dark:to-sky-600 text-white text-center">
                  A
                </div>
              )}

              {(favoritedCount || favorited || completed) && (
                <div
                  className={`px-1 absolute top-0.5 right-0.5 rounded-lg flex items-center transition ${statusBadgeColorClass}`}
                >
                  {completed ? <CheckIcon className="size-3.5" /> : <HeartIcon className="size-3.5" />}
                  {favoritedCount && <span className="text-xs font-bold">{favoritedCount}</span>}
                </div>
              )}

              {selectionStyle === "check" && checked && (
                <div className="absolute top-0.5 right-0.5 w-3/10 aspect-square text-white border rounded-full flex items-center justify-center bg-blue-500/90">
                  <CheckIcon className="w-full p-0.5" />
                </div>
              )}

              {selectionStyle === "check" && !checked && indeterminate && (
                <div className="absolute top-0.5 right-0.5 flex aspect-square w-3/10 items-center justify-center rounded-full border bg-blue-500/90 text-white">
                  <MinusIcon className="w-full p-0.5" />
                </div>
              )}

              {showsOverlayName ? (
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col justify-end bg-linear-15 from-black/60 from-10% via-transparent via-50% to-transparent px-1 pb-0.5 text-left md:px-1.5 md:pb-1 dark:from-black/80",
                    hideNameOnMobile && "hidden sm:flex",
                  )}
                >
                  <p
                    className={`whitespace-nowrap font-bold scale-75 origin-left leading-none tracking-tighter text-white ${nameSize === "small" ? "text-[10px]" : "text-xs"}`}
                  >
                    {overlaySubName}
                  </p>
                  <p
                    className={`${nameSize === "small" ? "text-[10px]" : "text-xs"} font-bold leading-tight tracking-tighter text-white line-clamp-1`}
                  >
                    {overlayMainName}
                  </p>
                </div>
              ) : isAssist || (label && labelPlacement === "default") || (!label && showTier) ? (
                <div className="absolute bottom-0 w-full flex justify-center text-xs font-bold bg-black/90">
                  {isAssist && (
                    <div className="px-1 md:px-1.5 text-xs font-bold bg-linear-to-br from-cyan-300 to-sky-500 dark:from-cyan-400 dark:to-sky-600 text-white text-center">
                      A
                    </div>
                  )}
                  {labelPlacement === "default" && label}
                  {!label && showTier && (
                    <div
                      className={`flex-grow flex justify-center items-center ${visibileTier(tier)[1] ? "text-teal-300" : "text-yellow-300"}`}
                    >
                      {tier <= 5 ? (
                        <StarIcon className="size-3.5 mr-0.5 inline-block" />
                      ) : (
                        <img
                          className="w-4 h-4 mr-0.5 inline-block"
                          src="/icons/exclusive_weapon.png"
                          alt="고유 장비"
                        />
                      )}
                      <span>{visibileTier(tier)[0]}</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            {showName && namePlacement === "below" && (
              <div
                className={cn("mt-1 text-center leading-tight tracking-tighter", hideNameOnMobile && "hidden sm:block")}
              >
                <p className={nameSize === "small" ? "text-xs" : "text-sm"}>{visibleNames[0]}</p>
                {visibleNames.length === 2 && <p className="text-xs">{visibleNames[1]}</p>}
              </div>
            )}
          </div>
        </div>
      </StudentCardFrame>

      {canUsePopupPortal && popup ? createPortal(popup, document.body) : popup}
    </div>
  );
}

type StudentCardPopupProps = {
  student: {
    uid: string | null;
    name: string;
    attackType?: Attack;
    defenseType?: Defense;
    role?: Role;
  };
  popups: {
    Icon?: React.ElementType;
    text?: string;
    children?: ReactNode;
    link?: string;
    onClick?: () => void;
  }[];
  onClose: () => void;
};

export function StudentCardPopup({ student, popups, onClose }: StudentCardPopupProps) {
  const { name, attackType, defenseType, role } = student;

  return (
    <div className="m-4 rounded-lg border border-border bg-white/90 text-base leading-normal text-black shadow-lg backdrop-blur-sm md:m-0 dark:bg-black/80 dark:text-white">
      <div className="px-4 pt-4 pb-2">
        <p className="text-lg font-bold">{name}</p>
        {attackType && defenseType && role && (
          <div className="py-2 flex text-sm gap-x-1">
            <AttributeBadge text={attackTypeLocale[attackType]} color={attackTypeColor[attackType]} />
            <AttributeBadge text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} />
            <AttributeBadge text={roleLocale[role]} color={roleColor[role]} />
          </div>
        )}
        <button
          type="button"
          className="absolute top-3 right-2 rounded-lg p-1 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={onClose}
          aria-label="학생 카드 팝업 닫기"
        >
          <XMarkIcon className="size-5 hover:text-neutral-700" strokeWidth={2} />
        </button>
      </div>
      <div>
        {popups.map((popup, index) => {
          const itemClassName = cn(`
            w-full px-4 py-3 flex items-center text-left hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80 transition gap-x-2 border-t border-neutral-200 dark:border-neutral-800
            ${index === popups.length - 1 ? "rounded-b-lg" : ""}
          `);

          const content = (
            <>
              {popup.Icon && <popup.Icon className="size-5" />}
              {popup.text && <span>{popup.text}</span>}
              {popup.children}
            </>
          );

          const key = `${popup.text ?? popup.link ?? `popup-${index}`}`;
          if (popup.link?.startsWith("/")) {
            return (
              <Link key={key} to={popup.link} className={itemClassName} onClick={onClose}>
                {content}
              </Link>
            );
          }
          if (popup.link) {
            return (
              <a
                key={key}
                href={popup.link}
                target="_blank"
                rel="noopener noreferrer"
                className={itemClassName}
                onClick={onClose}
              >
                {content}
              </a>
            );
          }
          return (
            <button
              key={key}
              type="button"
              className={itemClassName}
              onClick={() => {
                popup.onClick?.();
                onClose();
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
