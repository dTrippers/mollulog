import { data, Link } from "react-router";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import Page from "~/components/navigation/Page";
import CouponCard from "~/components/coupons/CouponCard";
import { getAllCoupons, getCouponRegistrations, registerCoupon, unregisterCoupon } from "~/models/coupon";
import { useLoaderData } from "react-router";
import { getSenseiPrivacyByUserId } from "~/models/sensei-privacy";
import { IdentificationIcon } from "@heroicons/react/16/solid";
import CopyField from "~/components/coupons/CopyField";

export const meta = () => [
  { title: "블루 아카이브 쿠폰 목록 | 몰루로그" },
  { name: "description", content: "블루 아카이브 인게임 재화를 획득할 수 있는 쿠폰 목록" },
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const coupons = await getAllCoupons(env);

  const sensei = await getAuthenticator(env).isAuthenticated(request);
  const currentUserData = sensei ? {
    registeredCouponIds: await getCouponRegistrations(env, sensei.id),
    memberCode: (await getSenseiPrivacyByUserId(env, sensei.id))?.memberCode ?? null,
  } : null;

  return {
    coupons,
    currentUserData,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) return data({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const couponId = Number(formData.get("couponId"));
  if (!Number.isFinite(couponId) || couponId <= 0) {
    return data({ error: "Invalid couponId" }, { status: 400 });
  }

  if (request.method === "POST") {
    await registerCoupon(env, sensei.id, couponId);
  } else if (request.method === "DELETE") {
    await unregisterCoupon(env, sensei.id, couponId);
  } else {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  return data({ success: true });
};

export default function CouponsPage() {
  const { coupons, currentUserData } = useLoaderData<typeof loader>();

  const memberCodeSection = currentUserData?.memberCode ? (
    <div className="px-3 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg">
      <div className="flex items-center gap-2">
        <IdentificationIcon className="size-4 shrink-0 text-neutral-400 dark:text-neutral-500" strokeWidth={2} />
        <CopyField text={currentUserData.memberCode} label="회원코드" />
      </div>
    </div>
  ) : currentUserData ? (
    <Link to="/edit" className="hover:opacity-80 transition-opacity">
      <span className="flex items-center gap-2 px-3 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg">
        <IdentificationIcon className="size-4 shrink-0 text-neutral-400 dark:text-neutral-500" strokeWidth={2} />
        <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">회원코드</span>
        <span className="flex-1 text-sm text-neutral-400 dark:text-neutral-500 italic">설정하러 가기</span>
      </span>
    </Link>
  ) : undefined;

  const registeredSet = new Set(currentUserData?.registeredCouponIds ?? []);
  return (
    <Page
      title="쿠폰"
      description="블루 아카이브 게임 내 재화를 획득할 수 있는 쿠폰 목록을 확인해보세요"
      belowTitle={memberCodeSection}
      links={[
        {
          Icon: ArrowTopRightOnSquareIcon,
          title: "쿠폰 등록",
          description: "공식 홈페이지에서 등록할 수 있어요",
          to: "https://mcoupon.nexon.com/bluearchive?lang=ko",
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
              signedIn={currentUserData !== null}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
