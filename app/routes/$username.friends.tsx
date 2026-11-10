import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { getFollowershipLists } from "~/models/followership";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { FriendList, type FriendTab } from "./$username.friends._components/FriendList";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  return getFollowershipLists(env, sensei.id, currentUser?.id, { ctx });
};

// The tab lives in the URL (`?tab=followers`), so the profile's follower link and a reload land on the same list.
export default function UserFriends() {
  const { following, followers } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: FriendTab = searchParams.get("tab") === "followers" ? "followers" : "following";

  return (
    <section aria-labelledby="friends-title" className="@container flex flex-col gap-v2-block-gap">
      <h2 id="friends-title" className="text-base font-bold text-v2-fg">
        친구 목록
      </h2>
      <SectionTabs
        label="친구 목록 구분"
        selectedId={tab}
        onChange={(id) => setSearchParams({ tab: id })}
        items={[
          { id: "following", label: `팔로잉 ${following.length.toLocaleString("en-US")}` },
          { id: "followers", label: `팔로워 ${followers.length.toLocaleString("en-US")}` },
        ]}
      />
      <FriendList tab={tab} senseis={tab === "followers" ? followers : following} />
    </section>
  );
}
