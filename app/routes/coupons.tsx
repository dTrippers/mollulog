import {
  ArrowTopRightOnSquareIcon,
  BellIcon,
  ClockIcon,
  IdentificationIcon,
  TicketIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { CouponCard } from "~/components/v2/features/coupons/CouponCard";
import { CouponCodeField } from "~/components/v2/features/coupons/CouponCodeField";
import {
  type AsideLinkItem,
  AsideLinks,
  MobileActionBar,
  type MobileActionLink,
  PageAside,
  PageAsideHeader,
  PageHeader,
  PageMain,
  PageToolbar,
  PanelSheet,
  ScreenTabs,
  V2Page,
} from "~/components/v2/layout";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { SaveToast } from "~/components/v2/primitives/SaveToast";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  COUPON_HISTORY_PAGE_SIZE,
  type CouponListTab,
  getCouponAlertLanding,
  getCouponAlertRowText,
  getCouponListTab,
  isCouponExpired,
  parseCouponAlertParam,
} from "~/domain/coupon-view";
import { getInstantTime } from "~/lib/date-time";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import { canonicalLink, socialMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { registerCoupon, unregisterCoupon } from "~/models/coupon";
import { type CouponView, getCouponPageData } from "~/views/coupons.server";

const PAGE_TITLE = "쿠폰";
const PAGE_DESCRIPTION = "블루 아카이브 게임 내 재화를 획득할 수 있는 쿠폰 목록을 확인해보세요";
const COUPON_REGISTER_URL = "https://mcoupon.nexon.com/bluearchive?lang=ko";
const MEMBER_CODE_PANEL_ID = "member-code";
const AVAILABLE_EMPTY_IMAGE_URL = "https://assets.mollulog.net/assets/videos/site/dear-yongha-kim.gif";
// Remaining time and a deadline that passes while the page is open are re-read on this interval.
const NOW_REFRESH_MS = 30_000;

export const meta: MetaFunction = ({ location }) => {
  const title = "블루 아카이브 쿠폰 목록";
  const description = "블루 아카이브 인게임 재화를 획득할 수 있는 쿠폰 목록";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
    canonicalLink(location.pathname),
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  return getCouponPageData(env, ctx, sensei?.id ?? null);
};

type CouponRecordActionData = { success: true } | { error: string };

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return data<CouponRecordActionData>({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const couponId = Number(formData.get("couponId"));
  if (!Number.isFinite(couponId) || couponId <= 0) {
    return data<CouponRecordActionData>({ error: "Invalid couponId" }, { status: 400 });
  }
  if (request.method !== "POST" && request.method !== "DELETE") {
    return data<CouponRecordActionData>({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (request.method === "POST") {
      await registerCoupon(env, sensei.id, couponId, { ctx });
    } else {
      await unregisterCoupon(env, sensei.id, couponId, { ctx });
    }
  } catch (error) {
    // The card goes back to its saved state and the page offers a retry; the raw error never reaches the page.
    console.error("Failed to save a coupon record.", sanitizeErrorForLogging(error));
    return data<CouponRecordActionData>({ error: "Save failed" }, { status: 500 });
  }
  return data<CouponRecordActionData>({ success: true });
};

type RecordFailure = { couponId: number; retry: () => void };

export default function CouponsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { coupons, viewer } = loaderData;
  const [searchParams] = useSearchParams();
  const { showSignIn } = useSignIn();
  const revalidator = useRevalidator();

  // Tabs are decided by what was recorded and expired when the page opened, so a card stays where it is when it is
  // recorded, and the server and the first client render agree.
  const [snapshot] = useState(() => ({
    loadedAt: loaderData.loadedAt,
    recordedIds: new Set(viewer?.recordedCouponIds ?? []),
  }));
  const [now, setNow] = useState(snapshot.loadedAt);
  useEffect(() => {
    setNow(new Date().toISOString());
    const timer = window.setInterval(() => setNow(new Date().toISOString()), NOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const [tab, setTab] = useState<CouponListTab>("available");
  const [historyLimit, setHistoryLimit] = useState(COUPON_HISTORY_PAGE_SIZE);
  const [savingIds, setSavingIds] = useState<ReadonlySet<number>>(() => new Set());
  const [failure, setFailure] = useState<RecordFailure | null>(null);

  const items = coupons.state === "loaded" ? coupons.items : [];
  const tabbed = useMemo(() => {
    const available: CouponView[] = [];
    const history: CouponView[] = [];
    for (const coupon of items) {
      const target = getCouponListTab(coupon, snapshot.recordedIds.has(coupon.id), snapshot.loadedAt) === "available";
      (target ? available : history).push(coupon);
    }
    // 사용 가능 lists the nearest deadline first, with the coupons that never expire last. 사용완료/만료 keeps the
    // server order, the latest deadline first.
    available.sort((a, b) => {
      if (a.expiresAt === b.expiresAt) return 0;
      if (a.expiresAt === null) return 1;
      if (b.expiresAt === null) return -1;
      return getInstantTime(a.expiresAt) - getInstantTime(b.expiresAt);
    });
    return { available, history };
  }, [items, snapshot]);

  const alertUids = useMemo(() => parseCouponAlertParam(searchParams.get("alert")), [searchParams]);
  const landing = useMemo(
    () =>
      getCouponAlertLanding(
        alertUids,
        items.map((coupon) => ({ ...coupon, recordedAtLoad: snapshot.recordedIds.has(coupon.id) })),
        snapshot.loadedAt,
      ),
    [alertUids, items, snapshot],
  );
  const highlightUids = useMemo(() => new Set(landing.highlightUids), [landing.highlightUids]);
  const firstHighlightUid = landing.highlightUids[0] ?? null;

  // The first coupon of the alert is brought into view once, when the page opens from the alert.
  const scrolledToHighlight = useRef(false);
  useEffect(() => {
    if (scrolledToHighlight.current || firstHighlightUid === null) return;
    scrolledToHighlight.current = true;
    document
      .querySelector(`[data-coupon-uid="${CSS.escape(firstHighlightUid)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [firstHighlightUid]);

  const selectTab = (next: CouponListTab) => {
    if (next === tab) return;
    setTab(next);
    trackGoogleAnalyticsEvent("filter_apply", { scope: "coupons", filter: "status" });
  };

  const handleSavingChange = useCallback((couponId: number, saving: boolean) => {
    setSavingIds((current) => {
      if (current.has(couponId) === saving) return current;
      const next = new Set(current);
      if (saving) next.add(couponId);
      else next.delete(couponId);
      return next;
    });
  }, []);
  const handleSaveResult = useCallback((couponId: number, failed: RecordFailure | null) => {
    setFailure((current) => {
      if (failed) return failed;
      return current?.couponId === couponId ? null : current;
    });
  }, []);

  const signedIn = viewer !== null;
  const alertRow = viewer?.alertStatus ? getCouponAlertRowText(viewer.alertStatus) : {};
  const alertTarget = signedIn ? { to: "/notifications", transition: "forward" as const } : { onClick: showSignIn };
  const asideLinks: AsideLinkItem[] = [
    { key: "register", title: "쿠폰 등록", Icon: ArrowTopRightOnSquareIcon, to: COUPON_REGISTER_URL },
    { key: "alert", title: "쿠폰 만료 알림", Icon: BellIcon, ...alertRow, ...alertTarget },
  ];
  const mobileLinks: MobileActionLink[] = [
    { key: "register", title: "쿠폰 등록", Icon: ArrowTopRightOnSquareIcon, to: COUPON_REGISTER_URL },
    { key: "alert", title: "쿠폰 만료 알림", shortTitle: "만료 알림", Icon: BellIcon, ...alertTarget },
  ];

  const shown = tab === "available" ? tabbed.available : tabbed.history.slice(0, historyLimit);

  return (
    <V2Page width="reading">
      <PageHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} stackedOnly />
      <PageToolbar>
        <ScreenTabs
          items={[
            {
              key: "available",
              text: "사용 가능",
              label: coupons.state === "loaded" ? String(tabbed.available.length) : undefined,
              Icon: TicketIcon,
              active: tab === "available",
              onClick: () => selectTab("available"),
            },
            {
              key: "history",
              text: "사용완료/만료",
              label: coupons.state === "loaded" ? String(tabbed.history.length) : undefined,
              Icon: ClockIcon,
              active: tab === "history",
              onClick: () => selectTab("history"),
            },
          ]}
        />
      </PageToolbar>
      <PageAside>
        <PageAsideHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <PanelSheet panelId={MEMBER_CODE_PANEL_ID} title="회원코드" Icon={IdentificationIcon}>
          <MemberCodePanelBody signedIn={signedIn} memberCode={viewer?.memberCode ?? null} onSignIn={showSignIn} />
        </PanelSheet>
        <AsideLinks items={asideLinks} />
      </PageAside>
      <MobileActionBar
        links={mobileLinks}
        panels={[{ panelId: MEMBER_CODE_PANEL_ID, title: "회원코드", Icon: IdentificationIcon }]}
      />
      <PageMain>
        {coupons.state === "failed" ? (
          <StatusNotice
            tone="danger"
            className="mt-2"
            action={
              <Button size="sm" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>
                다시 시도
              </Button>
            }
          >
            쿠폰 목록을 불러오지 못했어요
          </StatusNotice>
        ) : (
          <div className="flex flex-col gap-3.5">
            {signedIn ? (
              <StatusNotice tone="neutral">
                사용 완료 기록은 몰루로그에만 저장되며 게임에는 반영되지 않아요. 실제 쿠폰은 공식 쿠폰 등록 페이지에서
                등록해주세요.
              </StatusNotice>
            ) : null}
            {tab === "available" && landing.notice ? (
              <StatusNotice
                tone="warning"
                boxed
                action={
                  <Button size="sm" onClick={() => selectTab("history")}>
                    사용완료/만료 보기
                  </Button>
                }
              >
                {landing.notice}
              </StatusNotice>
            ) : null}
            {shown.length === 0 ? (
              <CouponEmptyState
                tab={tab}
                // Every coupon still usable was recorded, as opposed to there being none to use.
                allRecorded={tabbed.history.some(
                  (coupon) => snapshot.recordedIds.has(coupon.id) && !isCouponExpired(coupon, snapshot.loadedAt),
                )}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {shown.map((coupon) => (
                  <li key={coupon.uid} className="flex flex-col">
                    <RecordedCouponCard
                      coupon={coupon}
                      loadedAt={snapshot.loadedAt}
                      now={now}
                      signedIn={signedIn}
                      recorded={viewer?.recordedCouponIds.includes(coupon.id) ?? false}
                      highlighted={tab === "available" && highlightUids.has(coupon.uid)}
                      onSavingChange={handleSavingChange}
                      onSaveResult={handleSaveResult}
                    />
                  </li>
                ))}
              </ul>
            )}
            {tab === "history" && tabbed.history.length > historyLimit ? (
              <div className="flex justify-center pt-1">
                <Button onClick={() => setHistoryLimit((limit) => limit + COUPON_HISTORY_PAGE_SIZE)}>더 보기</Button>
              </div>
            ) : null}
          </div>
        )}
      </PageMain>
      <SaveToast saving={savingIds.size > 0} failed={failure !== null} onRetry={failure?.retry} aboveActionBar />
    </V2Page>
  );
}

function MemberCodePanelBody({
  signedIn,
  memberCode,
  onSignIn,
}: {
  signedIn: boolean;
  memberCode: string | null;
  onSignIn: () => void;
}) {
  if (!signedIn) {
    return (
      <div className="flex flex-col items-start gap-2.5">
        <p className="text-[0.8125rem] text-v2-fg-secondary">로그인하면 회원코드를 저장해 두고 바로 복사할 수 있어요</p>
        <Button size="sm" onClick={onSignIn}>
          로그인
        </Button>
      </div>
    );
  }
  if (memberCode === null) {
    return (
      <Link to="/edit" className={cn(v2ButtonClassName({ size: "sm" }), "self-start")}>
        설정하러 가기
      </Link>
    );
  }
  return <CouponCodeField code={memberCode} codeType="member_code" />;
}

// One card with its own record request. The shown record follows the request while it runs, then the saved state.
function RecordedCouponCard({
  coupon,
  loadedAt,
  now,
  signedIn,
  recorded,
  highlighted,
  onSavingChange,
  onSaveResult,
}: {
  coupon: CouponView;
  loadedAt: string;
  now: string;
  signedIn: boolean;
  recorded: boolean;
  highlighted: boolean;
  onSavingChange: (couponId: number, saving: boolean) => void;
  onSaveResult: (couponId: number, failure: RecordFailure | null) => void;
}) {
  const fetcher = useFetcher<CouponRecordActionData>();
  const pending = fetcher.state !== "idle";
  const shownRecorded = pending ? fetcher.formMethod === "POST" : recorded;
  const lastTarget = useRef<boolean | null>(null);

  const submit = useCallback(
    (target: boolean) => {
      lastTarget.current = target;
      fetcher.submit({ couponId: coupon.id }, { method: target ? "POST" : "DELETE" });
    },
    [fetcher.submit, coupon.id],
  );

  useEffect(() => {
    onSavingChange(coupon.id, pending);
  }, [coupon.id, pending, onSavingChange]);

  useEffect(() => {
    if (pending || lastTarget.current === null) return;
    const target = lastTarget.current;
    lastTarget.current = null;
    if (fetcher.data && "success" in fetcher.data) {
      trackGoogleAnalyticsEvent("coupon_marked", { state: target ? "used" : "unused" });
      onSaveResult(coupon.id, null);
    } else {
      onSaveResult(coupon.id, { couponId: coupon.id, retry: () => submit(target) });
    }
  }, [pending, fetcher.data, coupon.id, onSaveResult, submit]);

  return (
    <CouponCard
      coupon={coupon}
      loadedAt={loadedAt}
      now={now}
      highlighted={highlighted}
      record={
        signedIn
          ? { kind: "editable", recorded: shownRecorded, pending, onToggle: () => submit(!shownRecorded) }
          : { kind: "hidden" }
      }
    />
  );
}

function CouponEmptyState({ tab, allRecorded }: { tab: CouponListTab; allRecorded: boolean }) {
  if (tab === "history") {
    return <p className="py-10 text-center text-sm text-v2-fg-secondary">사용완료/만료된 쿠폰이 없어요</p>;
  }
  if (allRecorded) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircleIcon className="size-8 text-v2-success" aria-hidden="true" />
        <p className="text-sm font-medium text-v2-fg">사용 가능한 쿠폰을 모두 사용 완료로 기록했어요</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <img src={AVAILABLE_EMPTY_IMAGE_URL} alt="" className="mb-4 size-36 object-contain" loading="lazy" />
      <p className="text-sm font-medium text-v2-fg">현재 사용 가능한 쿠폰이 없어요</p>
    </div>
  );
}
