import type { ElementType, ReactNode } from "react";
import { useOutletContext } from "react-router";
import type { MobileActionBarProps, ScreenTabItem } from "~/components/v2/layout";
import type { ProfileVisibility } from "~/models/sensei";

export type UserScreen = "profile" | "students" | "pickups" | "futures";

// What a child of the `/@username` layout can read. The layout loader owns it, so a child never has to reload it.
export type UserLayoutContext = {
  username: string;
  // The signed-in account owns this profile.
  isOwner: boolean;
  signedIn: boolean;
  profileVisibility: ProfileVisibility;
  // Whether other people can see the student growth state. Only the owner sees the value of a private profile.
  growthVisibility: boolean;
  // `null` means the count could not be loaded, which is not the same as zero.
  recruitedStudentCount: number | null;
  pickupCount: number | null;
  // Collapse the Aside (desktop) while a screen edits a wide table. The layout restores it when the child unmounts
  // or calls this with `false`.
  setAsideCollapsed: (collapsed: boolean) => void;
  // A screen that needs panels or links of its own in the Aside replaces the default links under the screen menu with
  // its own content, and releases it by passing `null`, including when it unmounts. The first
  // server render has the default links, because the screen sets its content after it mounts.
  setAsideContent: (content: ReactNode) => void;
  // The same for the owner's bottom action bar on stacked layouts. A panel entry needs its PanelSheet in `setAsideContent`.
  setMobileActions: (actions: MobileActionBarProps | null) => void;
  // Transitional: the 1.x screens that are not migrated yet still call these. They do nothing.
  setPanels: (panels: unknown[]) => void;
  setLinks: (links: unknown) => void;
};

export function useUserLayout(): UserLayoutContext {
  return useOutletContext<UserLayoutContext>();
}

export function getUserScreen(pathname: string, username: string): UserScreen | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const root = `/@${username}`;
  // The friends list belongs to the profile, so the profile stays selected there.
  if (normalized === root || normalized === `${root}/friends` || normalized.startsWith(`${root}/friends/`)) {
    return "profile";
  }
  if (normalized === `${root}/students` || normalized.startsWith(`${root}/students/`)) return "students";
  if (normalized === `${root}/pickups` || normalized.startsWith(`${root}/pickups/`)) return "pickups";
  if (normalized === `${root}/futures`) return "futures";
  return null;
}

export function formatUserCount(count: number | null): string | undefined {
  return count === null ? undefined : count.toLocaleString("en-US");
}

export type UserScreenIcons = {
  profile: ElementType;
  students: ElementType;
  pickups: ElementType;
  futures: ElementType;
};

// One list feeds the Aside menu on desktop and the tabs under the header on mobile.
export function buildUserScreenItems({
  username,
  pathname,
  recruitedStudentCount,
  pickupCount,
  icons,
}: {
  username: string;
  pathname: string;
  recruitedStudentCount: number | null;
  pickupCount: number | null;
  icons: UserScreenIcons;
}): ScreenTabItem[] {
  const screen = getUserScreen(pathname, username);
  return [
    { key: "profile", text: "프로필", Icon: icons.profile, link: `/@${username}`, active: screen === "profile" },
    {
      key: "students",
      text: "모집한 학생",
      label: formatUserCount(recruitedStudentCount),
      Icon: icons.students,
      link: `/@${username}/students`,
      active: screen === "students",
    },
    {
      key: "pickups",
      text: "모집 기록",
      label: formatUserCount(pickupCount),
      Icon: icons.pickups,
      link: `/@${username}/pickups`,
      active: screen === "pickups",
    },
    {
      key: "futures",
      text: "관심 학생",
      Icon: icons.futures,
      link: `/@${username}/futures`,
      active: screen === "futures",
    },
  ];
}

export const FOLLOW_FAILURE_MESSAGE = "팔로우하지 못했어요. 다시 시도해주세요.";
export const UNFOLLOW_FAILURE_MESSAGE = "팔로우를 해제하지 못했어요. 다시 시도해주세요.";
