import { data } from "react-router";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import Page from "~/components/navigation/Page";
import CouponCard from "~/components/coupons/CouponCard";
import { getAllCoupons, getCouponRegistrations, registerCoupon, unregisterCoupon } from "~/models/coupon";
import { useLoaderData } from "react-router";

export const meta = () => [
  { title: "쿠폰 목록 | 몰루로그" },
  { name: "description", content: "블루 아카이브 인게임 재화를 획득할 수 있는 쿠폰 목록" },
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);

  const coupons = await getAllCoupons(env);
  const registeredCouponIds = sensei
    ? [...(await getCouponRegistrations(env, sensei.id))]
    : [];

  return { coupons, registeredCouponIds, signedIn: sensei !== null, memberCode: sensei?.memberCode ?? null };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) return data({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const couponId = Number(formData.get("couponId"));

  if (request.method === "POST") {
    await registerCoupon(env, sensei.id, couponId);
  } else if (request.method === "DELETE") {
    await unregisterCoupon(env, sensei.id, couponId);
  }

  return data({ success: true });
};

export default function CouponsPage() {
  const { coupons, registeredCouponIds, signedIn, memberCode } = useLoaderData<typeof loader>();

  const registeredSet = new Set(registeredCouponIds);

  return (
    <Page
      title="쿠폰"
      description="블루 아카이브 게임 내 재화를 획득할 수 있는 쿠폰 목록을 확인해보세요"
      links={[
        {
          Icon: ArrowTopRightOnSquareIcon,
          title: "등록하러 가기",
          description: "공식 홈페이지에서 등록할 수 있어요",
          to: "https://mcoupon.nexon.com/bluearchive",
        },
      ]}
    >
      {coupons.length === 0 ? (
        <div className="py-16 text-center text-neutral-400 dark:text-neutral-500">
          쿠폰이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {coupons.map((coupon) => (
            <CouponCard
              key={coupon.uid}
              coupon={coupon}
              registered={registeredSet.has(coupon.id)}
              signedIn={signedIn}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
