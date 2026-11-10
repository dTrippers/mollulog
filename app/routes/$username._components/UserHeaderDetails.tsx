import { useState } from "react";
import { Link } from "react-router";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";

// The full-width lines under the @username row: the introduction, then the friend code with its copy button and the
// following and follower counts, each a bold number before a muted label. The units wrap as a whole when the header is
// narrow. Counts that failed to load (`null`) drop out instead of showing a wrong number.
export function UserHeaderDetails({
  username,
  bio,
  friendCode,
  counts,
}: {
  username: string;
  bio: string | null;
  friendCode: string | null;
  counts: { following: number; followers: number } | null;
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const hasMeta = friendCode !== null || counts !== null;

  return (
    <div className="flex flex-col gap-2">
      {bio ? (
        <p className="text-sm leading-6 break-keep whitespace-pre-wrap text-v2-fg [overflow-wrap:anywhere]">{bio}</p>
      ) : null}
      {hasMeta ? (
        <div data-region="profile-meta" className="text-sm text-v2-fg-tertiary">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {friendCode ? (
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span>친구 코드</span>
                <span className="font-semibold text-v2-fg tabular-nums">{friendCode}</span>
                <CopyTextButton
                  value={friendCode}
                  variant="icon"
                  label="친구 코드 복사"
                  className="-my-1 [&_button]:size-6"
                  onStatusChange={setCopyStatus}
                />
              </span>
            ) : null}
            {counts ? (
              <span className="inline-flex items-center gap-3 whitespace-nowrap">
                <CountLink to={`/@${username}/friends?tab=following`} label="팔로잉" value={counts.following} />
                <CountLink to={`/@${username}/friends?tab=followers`} label="팔로워" value={counts.followers} />
              </span>
            ) : null}
          </div>
          <CopyStatusMessage status={copyStatus} />
        </div>
      ) : null}
    </div>
  );
}

function CountLink({ to, label, value }: { to: string; label: string; value: number }) {
  const text = value.toLocaleString("en-US");
  return (
    <Link to={to} aria-label={`${label} ${text}`} className="rounded-md hover:underline">
      <span className="font-semibold text-v2-fg tabular-nums">{text}</span> {label}
    </Link>
  );
}
