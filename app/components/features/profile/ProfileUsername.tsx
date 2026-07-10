import { PencilSquareIcon, UserIcon, UserMinusIcon, UserPlusIcon, UsersIcon } from "@heroicons/react/20/solid";
import { Link } from "react-router";
import { Button, ProfileImage } from "~/components/primitives";
import { cn } from "~/lib/utils";

type ProfileUsernameProps = {
  profileStudentUid: string | null;
  username: string;
  bio: string | null;
  friendCode: string | null;
  loading?: boolean;
  followability?: "followable" | "following" | "unable";
  followingCount?: number;
  followerCount?: number;
  onFollow?: () => void;
  onUnfollow?: () => void;
};

export default function ProfileUsername({
  profileStudentUid,
  username,
  bio,
  friendCode,
  loading,
  followability,
  followerCount,
  followingCount,
  onFollow,
  onUnfollow,
}: ProfileUsernameProps) {
  return (
    <div className="m-4 md:m-6">
      <div className="flex items-center">
        <ProfileImage studentUid={profileStudentUid} imageSize={16} />
        <div className="ml-2 md:ml-4 grow">
          <p className="font-bold text-lg md:text-xl">@{username}</p>
          <div className="flex flex-col md:flex-row text-sm">
            {followerCount !== undefined && followingCount !== undefined && (
              <p>
                <Link to={`/@${username}/friends?tab=following`} className="hover:underline mr-2">
                  {followingCount} <span className="text-muted-foreground">팔로잉</span>
                </Link>
                <Link to={`/@${username}/friends?tab=following`} className="hover:underline">
                  {followerCount} <span className="text-muted-foreground">팔로워</span>
                </Link>
              </p>
            )}
            {followerCount !== undefined && followingCount !== undefined && friendCode && (
              <span className="mx-1.5 hidden text-muted-foreground/50 md:inline">|</span>
            )}
            {friendCode && (
              <p>
                <span className="text-muted-foreground">친구 코드 </span>
                <span>{friendCode}</span>
              </p>
            )}
          </div>
        </div>
        {followability === "followable" && onFollow && (
          <button
            type="button"
            className={cn(`
              flex shrink-0 cursor-pointer items-center rounded-full bg-primary px-4 py-2 text-primary-foreground transition-colors
              hover:bg-primary/90 disabled:opacity-50
            `)}
            onClick={onFollow}
            disabled={loading}
          >
            <UserPlusIcon className="size-4 mr-1" />
            <span className="text-sm">팔로우</span>
          </button>
        )}
        {followability === "following" && onUnfollow && (
          <button
            type="button"
            className={cn(`
              group flex shrink-0 cursor-pointer items-center rounded-full bg-muted px-4 py-2 text-foreground transition-colors
              hover:bg-destructive hover:text-white disabled:opacity-50
            `)}
            onClick={onUnfollow}
            disabled={loading}
          >
            <UsersIcon className="size-4 mr-1 block group-hover:hidden" />
            <span className="text-sm block group-hover:hidden">팔로우 중</span>
            <UserMinusIcon className="size-4 mr-1 hidden group-hover:block" />
            <span className="text-sm hidden group-hover:block">팔로우 해제</span>
          </button>
        )}
        {followability === "unable" && (
          <Button
            to="/edit"
            icon={PencilSquareIcon}
            text="프로필 관리"
            variant="primary"
            className="ml-2 rounded-full"
          />
        )}
      </div>
      {bio && <p className="my-2 md:my-4 text-sm md:text-base">{bio}</p>}
    </div>
  );
}
