import { IdentificationIcon } from "@heroicons/react/16/solid";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import CopyField from "~/components/features/coupons/CopyField";
import CouponCard from "~/components/features/coupons/CouponCard";
import { type CouponDisplayStatus, getCouponDisplayStatus } from "~/components/features/coupons/coupon-display";
import Page from "~/components/features/layout/Page";
import { FilterButtons } from "~/components/primitives";
import { canonicalLink } from "~/lib/seo";
import { getAllCoupons, getCouponRegistrations, registerCoupon, unregisterCoupon } from "~/models/coupon";
import { getSenseiPrivacyByUserId } from "~/models/sensei-privacy";

type CouponStatusFilter = CouponDisplayStatus;

const AVAILABLE_EMPTY_IMAGE_URL = "https://assets.mollulog.net/assets/videos/site/dear-yongha-kim.gif";

const COUPON_STATUS_FILTERS: { id: CouponStatusFilter; label: string }[] = [
  { id: "available", label: "사용 가능" },
  { id: "history", label: "사용완료/만료" },
];

export const meta: MetaFunction = ({ location }) => [
  { title: "블루 아카이브 쿠폰 목록 | 몰루로그" },
  { name: "description", content: "블루 아카이브 인게임 재화를 획득할 수 있는 쿠폰 목록" },
  canonicalLink(location.pathname),
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const coupons = await getAllCoupons(env, { ctx });

  const sensei = await getActiveSensei(env, request, ctx);
  const currentUserData = sensei
    ? {
        registeredCouponIds: await getCouponRegistrations(env, sensei.id, { ctx }),
        memberCode: (await getSenseiPrivacyByUserId(env, sensei.id, { ctx }))?.memberCode ?? null,
      }
    : null;

  return {
    coupons,
    currentUserData,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return data({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const couponId = Number(formData.get("couponId"));
  if (!Number.isFinite(couponId) || couponId <= 0) {
    return data({ error: "Invalid couponId" }, { status: 400 });
  }

  if (request.method === "POST") {
    await registerCoupon(env, sensei.id, couponId, { ctx });
  } else if (request.method === "DELETE") {
    await unregisterCoupon(env, sensei.id, couponId, { ctx });
  } else {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  return data({ success: true });
};

export default function CouponsPage() {
  const { coupons, currentUserData } = useLoaderData<typeof loader>();
  const [statusFilter, setStatusFilter] = useState<CouponStatusFilter>("available");
  const [initialRegisteredCouponIds] = useState(() => currentUserData?.registeredCouponIds ?? []);

  const memberCodeSection = currentUserData?.memberCode ? (
    <div className="rounded-lg bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <IdentificationIcon className="size-4 shrink-0 text-neutral-400 dark:text-neutral-500" strokeWidth={2} />
        <CopyField text={currentUserData.memberCode} label="회원코드" />
      </div>
    </div>
  ) : currentUserData ? (
    <Link to="/edit" className="block rounded-lg transition-colors hover:bg-muted">
      <span className="flex items-center gap-2 rounded-lg bg-card px-3 py-2.5">
        <IdentificationIcon className="size-4 shrink-0 text-neutral-400 dark:text-neutral-500" strokeWidth={2} />
        <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">회원코드</span>
        <span className="flex-1 text-sm text-neutral-400 dark:text-neutral-500 italic">설정하러 가기</span>
      </span>
    </Link>
  ) : undefined;

  const registeredSet = new Set(currentUserData?.registeredCouponIds ?? []);
  const initialRegisteredSet = new Set(initialRegisteredCouponIds);
  const displayedCoupons = coupons.filter(
    (coupon) => getCouponDisplayStatus(coupon, initialRegisteredSet.has(coupon.id)) === statusFilter,
  );

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
      <div className="mb-4">
        <FilterButtons
          surface="page"
          exclusive
          atLeastOne
          size="sm"
          buttonProps={COUPON_STATUS_FILTERS.map((filter) => ({
            text: filter.label,
            active: statusFilter === filter.id,
            onToggle: (activated) => {
              if (activated) setStatusFilter(filter.id);
            },
          }))}
        />
      </div>

      {displayedCoupons.length === 0 ? (
        <CouponEmptyView statusFilter={statusFilter} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {displayedCoupons.map((coupon) => (
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

function CouponEmptyView({ statusFilter }: { statusFilter: CouponStatusFilter }) {
  if (statusFilter === "available") {
    return (
      <div className="my-16 flex w-full flex-col items-center justify-center text-center">
        <img src={AVAILABLE_EMPTY_IMAGE_URL} alt="" className="mb-4 size-36 object-contain" loading="lazy" />
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">현재 사용 가능한 쿠폰이 없어요</p>
      </div>
    );
  }

  return <div className="py-16 text-center text-neutral-400 dark:text-neutral-500">사용완료/만료된 쿠폰이 없어요</div>;
}
