import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { SenseiAvatar } from "~/components/v2/features/comments/SenseiAvatar";
import { v2FocusRing } from "~/components/v2/layout/styles";
import type { AccountLabel } from "~/domain/account-label";
import { cn } from "~/lib/utils";

export type FriendListItem = {
  username: string;
  bio: string | null;
  profileStudentId: string | null;
  friendCode: string | null;
  labels?: AccountLabel[];
};

export type FriendTab = "following" | "followers";

const emptyText: Record<FriendTab, string> = {
  following: "아직 팔로우한 선생님이 없어요",
  followers: "아직 팔로워가 없어요",
};

// The first line of the bio only: the row is a pointer to the profile, which shows the whole text.
export function getBioFirstLine(bio: string | null): string | null {
  const line = bio
    ?.split(/\r?\n/)
    .map((text) => text.trim())
    .find((text) => text.length > 0);
  return line ?? null;
}

// The people of one tab. Each row is one link to the profile: avatar, @id, the first bio line and the friend code.
export function FriendList({ tab, senseis }: { tab: FriendTab; senseis: FriendListItem[] }) {
  if (senseis.length === 0) {
    return (
      <div className="rounded-lg bg-v2-surface px-v2-block-p py-8 text-center text-sm text-v2-fg-secondary">
        {emptyText[tab]}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-v2-divider overflow-hidden rounded-lg bg-v2-surface">
      {senseis.map((sensei) => {
        const bioLine = getBioFirstLine(sensei.bio);
        return (
          <li key={sensei.username}>
            <Link
              to={`/@${sensei.username}`}
              className={cn(
                "flex items-center gap-v2-media-gap px-v2-block-p py-3 transition-colors hover:bg-v2-hover",
                v2FocusRing,
              )}
            >
              <SenseiAvatar profileStudentId={sensei.profileStudentId} labels={sensei.labels} size="post" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-v2-fg">@{sensei.username}</span>
                {bioLine ? <span className="truncate text-[0.8125rem] text-v2-fg-secondary">{bioLine}</span> : null}
              </span>
              {sensei.friendCode ? (
                <span className="shrink-0 text-xs text-v2-fg-tertiary tabular-nums">친구 코드 {sensei.friendCode}</span>
              ) : null}
              <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
