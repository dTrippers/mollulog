import { DocumentMagnifyingGlassIcon, LockClosedIcon, UserIcon } from "@heroicons/react/24/outline";
import { useParams, useRevalidator, useRouteError } from "react-router";
import { RaidRecordLoadFailure } from "~/components/v2/features/raid-records/RaidRecordLoadFailure";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import { UserStateMessage } from "../$username._components/UserStateMessage";

// The error screen of a record page outside the profile layout: add, edit, table, and a visitor's record detail.
export function RaidRecordPageError({ title }: { title: string }) {
  const error = useRouteError();
  const params = useParams();
  const revalidator = useRevalidator();
  const normalized = normalizeRouteError(error);
  const back = { title: "총력전·대결전 기록", to: `/${params.username ?? ""}/raids` };

  let body: React.ReactNode;
  if (isServerRouteError(normalized)) {
    body = <RaidRecordLoadFailure onRetry={() => revalidator.revalidate()} retrying={revalidator.state !== "idle"} />;
  } else if (normalized.code === "sensei.profile_private") {
    body = (
      <UserStateMessage
        Icon={LockClosedIcon}
        title="비공개 프로필이에요"
        description="이 프로필의 정보와 작성한 콘텐츠는 본인만 볼 수 있어요."
      />
    );
  } else if (normalized.code === "sensei.not_found") {
    body = <UserStateMessage Icon={UserIcon} title="선생님을 찾을 수 없어요" description="주소의 @아이디를 다시 확인해주세요." />;
  } else if (normalized.code === "raid_record.not_found") {
    body = (
      <UserStateMessage
        Icon={DocumentMagnifyingGlassIcon}
        title="기록을 찾을 수 없어요"
        description="삭제되었거나 주소가 잘못되었을 수 있어요."
      />
    );
  } else {
    body = <UserStateMessage Icon={DocumentMagnifyingGlassIcon} title={normalized.title} description={normalized.message} />;
  }
  return (
    <V2Page width="reading">
      <PageHeader back={back} title={title} titleHidden />
      <PageMain>{body}</PageMain>
    </V2Page>
  );
}
