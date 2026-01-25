import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { SparklesIcon, UsersIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { SubTitle } from "~/components/atoms/typography";
import { FilterButtons } from "~/components/navigation";
import { ErrorPage } from "~/components/organisms/error";
import { SenseiList } from "~/components/organisms/sensei";
import { getFollowers, getFollowings } from "~/models/followership";
import type { Sensei } from "~/models/sensei";
import { getRouteSensei } from "./$username";

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getRouteSensei(env, params);
  return {
    following: await getFollowings(env, sensei.id),
    followers: await getFollowers(env, sensei.id),
  };
};

export default function UserFollowing() {
  const { following, followers } = useLoaderData<typeof loader>();

  const [params, setParams] = useSearchParams();
  const [senseis, setSenseis] = useState<Sensei[]>(params.get("tab") === "followers" ? followers : following);
  useEffect(() => {
    setSenseis(params.get("tab") === "followers" ? followers : following);
  }, [params]);

  return (
    <div className="my-8">
      <SubTitle text="친구 목록" />
      <FilterButtons
        Icon={UsersIcon}
        buttonProps={[
          {
            text: "팔로잉",
            active: params.get("tab") !== "followers",
            onToggle: () => { setParams({ tab: "following" }, { replace: false }) },
          },
          {
            text: "팔로워",
            active: params.get("tab") === "followers",
            onToggle: () => { setParams({ tab: "followers" }, { replace: false }) },
          },
        ]}
        exclusive
      />

      {senseis.length === 0 ?
        <ErrorPage Icon={SparklesIcon} message="등록한 친구가 없어요 :(" /> :
        <SenseiList senseis={senseis} />
      }
    </div>
  );
}
