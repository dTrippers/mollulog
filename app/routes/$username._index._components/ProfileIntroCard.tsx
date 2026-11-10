import { CheckBadgeIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { Link } from "react-router";
import { type CopyStatus, CopyStatusMessage, CopyTextButton } from "~/components/v2/features/developers/CopyTextButton";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";

// The introduction, the friend code with its copy button, and the following and follower counts. The text sits on the
// left and the three values on the right; when the card is narrower than 40rem the values go under the text. With no
// introduction the card keeps only the three values.
export function ProfileIntroCard({
  username,
  bio,
  friendCode,
  followingCount,
  followerCount,
}: {
  username: string;
  bio: string | null;
  friendCode: string | null;
  followingCount: number;
  followerCount: number;
}) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  return (
    <section aria-label="소개" className="@container">
      <div className="grid items-center gap-x-6 gap-y-4 rounded-lg bg-v2-surface p-v2-block-p @min-[40rem]:grid-cols-[minmax(0,1fr)_auto]">
        {bio ? (
          <p className="min-w-0 text-sm leading-6 break-keep whitespace-pre-wrap text-v2-fg [overflow-wrap:anywhere] @min-[40rem]:col-start-1">
            {bio}
          </p>
        ) : null}
        <dl
          className={`relative flex items-stretch ${bio ? "@min-[40rem]:col-start-2 @min-[40rem]:row-start-1" : "@min-[40rem]:col-span-2"}`}
        >
          {friendCode ? (
            <div className="flex min-w-0 flex-col justify-center gap-0.5 pr-5">
              <dt className="text-xs text-v2-fg-tertiary">친구 코드</dt>
              <dd className="flex items-center gap-1 text-base font-bold text-v2-fg tabular-nums">
                {friendCode}
                <CopyTextButton
                  value={friendCode}
                  variant="icon"
                  label="친구 코드 복사"
                  className="[&_button]:size-6"
                  onStatusChange={setCopyStatus}
                />
              </dd>
            </div>
          ) : null}
          <CountLink
            to={`/@${username}/friends?tab=following`}
            label="팔로잉"
            value={followingCount}
            divided={friendCode !== null}
          />
          <CountLink to={`/@${username}/friends?tab=followers`} label="팔로워" value={followerCount} divided />
          <div className="absolute top-full right-0 z-10">
            <CopyStatusMessage status={copyStatus} />
          </div>
        </dl>
      </div>
    </section>
  );
}

function CountLink({ to, label, value, divided }: { to: string; label: string; value: number; divided: boolean }) {
  const text = value.toLocaleString("en-US");
  return (
    <div
      className={`flex min-w-[5.5rem] flex-col justify-center gap-0.5 ${divided ? "border-l border-v2-divider px-5" : "pr-5"}`}
    >
      <dt className="text-xs text-v2-fg-tertiary">{label}</dt>
      <dd className="text-base font-bold text-v2-fg tabular-nums">
        <Link to={to} aria-label={`${label} ${text}`} className="rounded-md hover:underline">
          {text}
        </Link>
      </dd>
    </div>
  );
}

// "몰루로그 공식 계정이에요" sits above the introduction, once.
export function OfficialAccountNotice() {
  return (
    <StatusNotice tone="neutral" boxed Icon={CheckBadgeIcon}>
      <p className="font-semibold text-v2-fg">몰루로그 공식 계정이에요</p>
      <p className="text-v2-fg-secondary">
        문의 사항은{" "}
        <Link to="/contact" className="font-medium text-v2-link underline underline-offset-2 hover:decoration-2">
          제안/문의 페이지
        </Link>
        에 남겨주세요.
      </p>
    </StatusNotice>
  );
}
