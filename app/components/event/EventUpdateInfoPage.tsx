import { InformationCircleIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { MarkdownText, SubTitle } from "~/components/atoms/typography";
import EventInfoCard from "./EventInfoCard";
import EventList from "./EventList";
import type { EventType } from "~/models/content.d";

type EventUpdateInfoPageProps = {
  nearbyEvents: {
    type: EventType;
    uid: string;
    name: string;
    since: Date;
    until: Date;
    imageUrl: string | null;
  }[];
  description: string;
};

export default function EventUpdateInfoPage({ nearbyEvents, description }: EventUpdateInfoPageProps) {
  return (
    <>
      <Link to="https://forum.nexon.com/bluearchive/board_list?board=1076" target="_blank" rel="noopener noreferrer">
        <EventInfoCard
          Icon={InformationCircleIcon}
          title="업데이트 내용은 변경될 수 있어요"
          description="정확한 내용과 일정은 블루 아카이브 공식 커뮤니티에서 확인해주세요."
          onClick={() => { }}
          showArrow
        />
      </Link>

      {nearbyEvents.length > 0 && (
        <>
          <SubTitle text="점검 후 개최 컨텐츠" />
          <EventList events={nearbyEvents} />
        </>
      )}

      <MarkdownText text={description} />
    </>
  );
}
