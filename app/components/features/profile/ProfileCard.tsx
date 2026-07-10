import { Link } from "react-router";
import { TierCounts } from "~/components/features/students";
import ProfileUsername from "./ProfileUsername";

export type ProfileCardProps = {
  profileStudentUid: string | null;
  username: string;
  bio: string | null;
  friendCode: string | null;
  tierCounts: { [key: number]: number };
  loading: boolean;
  followability: "followable" | "following" | "unable";
  followingCount: number;
  followerCount: number;
  onFollow: () => void;
  onUnfollow: () => void;
};

export default function ProfileCard(props: ProfileCardProps) {
  const { username, tierCounts } = props;

  return (
    <div className="my-4 rounded-lg bg-card">
      <ProfileUsername {...props} />

      <div className="m-4 md:m-6">
        <TierCounts tierCounts={tierCounts} visibleTiers={[1, 2, 3, 4, 5, 6, 7, 8, 9]} />
      </div>

      <Link to={`/@${username}/students`}>
        <p className="m-4 md:m-6 text-right">전체학생 목록 →</p>
      </Link>
    </div>
  );
}
