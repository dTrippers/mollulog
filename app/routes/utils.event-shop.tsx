import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { EmptyView } from "~/components/primitives";
import { getEventShopDestinationPath, selectEventShopDestination } from "~/domain/event-shop-destination";
import { nowUtcIso } from "~/lib/date-time";
import { socialMeta } from "~/lib/seo";
import { getShopAvailableEvents } from "~/models/event-content";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const destination = selectEventShopDestination(await getShopAvailableEvents(publicReadEnv, ctx), nowUtcIso());
  if (destination) {
    return redirect(getEventShopDestinationPath(destination.uid));
  }

  return null;
};

// Reached only when no event shop is open or upcoming; otherwise the loader redirects to that event's shop.
export const meta: MetaFunction = ({ location }) => {
  const title = "이벤트 상점 계산기";
  return [{ title: `${title} | 몰루로그` }, ...socialMeta({ title, pathname: location.pathname })];
};

export default function EventShopUtility() {
  return (
    <EmptyView
      text="이용 가능한 이벤트 상점이 없어요"
      description="진행 중이거나 예정된 이벤트 상점이 생기면 여기에서 바로 이동할 수 있어요."
    />
  );
}
