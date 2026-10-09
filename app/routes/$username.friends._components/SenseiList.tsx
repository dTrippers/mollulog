import { Link } from "react-router";
import { ProfileUsername } from "~/components/features/profile";
import type { AccountLabel } from "~/domain/account-label";

type SenseiListProps = {
  senseis: {
    username: string;
    bio: string | null;
    profileStudentId: string | null;
    friendCode: string | null;
    labels?: AccountLabel[];
  }[];
};

export default function SenseiList({ senseis }: SenseiListProps) {
  return (
    <>
      {senseis.map((sensei) => {
        return (
          <Link key={`sensei-${sensei.username}`} to={`/@${sensei.username}`}>
            <div className="my-4 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition rounded-lg">
              <ProfileUsername
                profileStudentUid={sensei.profileStudentId}
                username={sensei.username}
                bio={sensei.bio}
                friendCode={sensei.friendCode}
                labels={sensei.labels}
              />
            </div>
          </Link>
        );
      })}
    </>
  );
}
