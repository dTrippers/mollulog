import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CloudIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PhotoIcon,
  ShieldCheckIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { data, type LoaderFunctionArgs, type MetaFunction, useLoaderData } from "react-router";
import {
  getSecurityCampaignIdentity,
  isSecurityCampaignToken,
  serializeSecurityCampaignIdentity,
} from "~/auth/security-campaign.server";
import { getSecurityCampaignVisitCount } from "~/lib/security-campaign-referrals.server";
import { canonicalLink } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { studentImageUrl, studentStandingImageUrl } from "~/models/assets";

const OFFICIAL_NOTICE_URL = "https://forum.nexon.com/bluearchive/board_view?board=1018&thread=3123030";
const NAMU_WIKI_URL =
  "https://namu.wiki/w/2025%EB%85%84%20%EB%B8%94%EB%A3%A8%20%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B8%8C%20%EC%84%9C%EB%B2%84%20%ED%95%B4%ED%82%B9%20%EC%82%AC%EA%B1%B4";
const KOYUKI_IMAGE_URL = studentStandingImageUrl("10063");
const KOYUKI_AVATAR_URL = studentImageUrl("10063");
const YUUKA_AVATAR_URL = studentImageUrl("13010");
const KAYOKO_AVATAR_URL = studentImageUrl("13005");
const MIYAKO_AVATAR_URL = studentImageUrl("10038");

const MOMO_TALK_CONTACTS = [
  {
    name: "코유키",
    avatarUrl: KOYUKI_AVATAR_URL,
    preview: "선생님! 이번에 오디세이아 학원 이벤트가 공개된대요!",
  },
  {
    name: "유우카",
    avatarUrl: YUUKA_AVATAR_URL,
    preview: "선생님, 이번에 청휘석을 받을 수 있는 이벤트에 당첨되셨어요.",
  },
  {
    name: "카요코",
    avatarUrl: KAYOKO_AVATAR_URL,
    preview: "선생, 샬레 앞에서 못 보던 고양이를 발견했어.",
  },
  {
    name: "미야코",
    avatarUrl: MIYAKO_AVATAR_URL,
    preview: "이 정도의 공간이라면, 저 혼자서도 제압할 수 있겠군요⋯⋯.",
  },
] as const;

type QuizMessage = { kind: "text"; text: string } | { kind: "link"; text: string } | { kind: "file"; name: string };

type SecurityCampaignActionResult =
  | { ok: true; shareToken: string; visitCount: number; countCapped: boolean }
  | { ok: false; error: string };

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy failed");
  }
}

const INCIDENT_TIMELINE = [
  {
    time: "8.31 21:00경",
    title: "'코유키 증식' 제보 확산",
    description: "카페 방문 학생에 코유키가 증식한다는 제보가 올라오기 시작했어요.",
    Icon: PhotoIcon,
  },
  {
    time: "8.31 22:00경",
    title: "영향 범위 확대",
    description:
      "카페에 코유키뿐만 아니라 미쿠 또는 다수 학생이 나타나고, 공지사항이 ‘코유키 클리커’로 바뀌는 등 다양한 문제가 이어졌어요.",
    Icon: ExclamationTriangleIcon,
  },
  {
    time: "8.31 22:22",
    title: "긴급 점검 시작",
    description: "운영사는 긴급 점검을 시작했어요.",
    Icon: WrenchScrewdriverIcon,
  },
  {
    time: "9.1 04:40",
    title: "점검 종료",
    description: "장장 6시간에 걸친 서비스 점검이 완료되었어요.",
    Icon: CloudIcon,
  },
  {
    time: "9.1",
    title: "조사 결과",
    description: "운영사는 외부 접근 기록을 확인한 뒤 관련 경로를 차단하고 후속 조치를 안내했어요.",
    Icon: ShieldCheckIcon,
  },
] as const;

const INCIDENT_VIDEOS = [
  {
    id: "oJCuOqQCv4A",
    channel: "Nichi's crap posts",
  },
  {
    id: "gfBYB5FjkJc",
    channel: "Subvitals",
  },
  {
    id: "vCkjlsjyogg",
    channel: "Shin",
  },
  {
    id: "JOsQH9iWC1s",
    channel: "Reykafuu",
  },
] as const;

const QUIZ_SCENARIOS = [
  {
    category: "정보 요구",
    speaker: "유우카",
    avatarUrl: YUUKA_AVATAR_URL,
    messages: [
      { kind: "text", text: "선생님, 이번에 청휘석을 받을 수 있는 이벤트에 당첨되셨어요." },
      {
        kind: "text",
        text: "당첨금 수령을 위해 제가 관리해 드리던 계좌의 비밀번호와 OTP를 보내주시겠어요?",
      },
    ] satisfies QuizMessage[],
    question: "유우카에게 무엇이라고 답변할까요?",
    choices: [
      { id: "send-code", label: "청휘석은 못 참지! (당장 알려준다)", correct: false },
      { id: "check-notice", label: "공식 공지부터 확인할게.", correct: true },
    ],
    explanation: "비밀번호와 OTP는 누구에게도 알려주면 안 돼요. 상대가 믿을 만해 보여도 마찬가지예요.",
  },
  {
    category: "파일 다운로드",
    speaker: "카요코",
    avatarUrl: KAYOKO_AVATAR_URL,
    messages: [
      { kind: "text", text: "선생, 샬레 앞에서 못 보던 고양이를 발견했어." },
      { kind: "file", name: "IMG_0317.jpg" },
    ] satisfies QuizMessage[],
    question: "이 파일을 다운로드할까요?",
    choices: [
      { id: "download-file", label: "어디 보자. (다운로드한다.)", correct: false },
      { id: "show-in-person", label: "샬레에 와서 직접 보여줄래?", correct: true },
    ],
    explanation:
      "파일 이름과 아이콘만으로는 실제 형식을 알 수 없어요. 출처가 확실하지 않은 첨부 파일은 열거나 내려받지 않는 것이 안전해요.",
  },
  {
    category: "주소 확인",
    speaker: "코유키",
    avatarUrl: KOYUKI_AVATAR_URL,
    messages: [
      { kind: "text", text: "선생님! 이번에 오디세이아 학원 이벤트가 공개된대요! 니하하!" },
      { kind: "link", text: "https://m\u043Ellulog.net/futures" },
    ] satisfies QuizMessage[],
    question: "이 링크를 바로 열어도 될까요?",
    choices: [
      { id: "open-link", label: "열어본다", correct: false },
      { id: "do-not-open", label: "열지 않는다", correct: true },
    ],
    explanation:
      "주소에서 mollulog의 첫 번째 o는 알파벳이 아닌 키릴 문자 о였어요. 비슷하게 생긴 글자를 이용해 피싱 사이트로 유도하는 경우가 있으니 조심해야 해요.",
  },
] as const;

export const meta: MetaFunction = ({ location }) => {
  const openGraphTitle = "이 편지는 트리니티에서 최초로 시작되어...";
  const description = "2025년 8월 31일 블루 아카이브 글로벌 서버 사건 요약 및 보안 점검";
  const previewDescription = "선생님께 도착한 메시지가 있어요.";

  return [
    { title: "2025년 8월 31일 | 몰루로그" },
    { name: "description", content: description },
    { property: "og:title", content: openGraphTitle },
    { property: "og:description", content: previewDescription },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: openGraphTitle },
    { name: "twitter:description", content: previewDescription },
    canonicalLink(location.pathname),
  ];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { env } = context.cloudflare;
  const identity = await getSecurityCampaignIdentity(env, request);
  const url = new URL(request.url);
  const incomingShareToken = url.searchParams.get("ref");
  const arrivedViaSharedLink = isSecurityCampaignToken(incomingShareToken);
  const showLinkNotice = arrivedViaSharedLink || url.searchParams.get("from") === "site-banner";

  let visitCount = 0;
  let countCapped = false;
  let countError = false;
  if (identity.shareToken) {
    try {
      const summary = await getSecurityCampaignVisitCount(env, identity.shareToken);
      visitCount = summary.count;
      countCapped = summary.capped;
    } catch (error) {
      console.error("Failed to read security campaign visit count", error);
      countError = true;
    }
  }

  return data(
    {
      shareToken: identity.shareToken ?? null,
      visitCount,
      countCapped,
      countError,
      showLinkNotice,
      shareOrigin: url.origin,
      incomingShareToken: arrivedViaSharedLink ? incomingShareToken : null,
    },
    {
      headers: {
        "Set-Cookie": await serializeSecurityCampaignIdentity(env, identity),
      },
    },
  );
}

export default function SecurityCampaign() {
  const loaderData = useLoaderData<typeof loader>();
  const [selectedVideoId, setSelectedVideoId] = useState<string>(INCIDENT_VIDEOS[0].id);
  const [quizStep, setQuizStep] = useState(0);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [quizResults, setQuizResults] = useState<boolean[]>([]);
  const [quizComplete, setQuizComplete] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [shareInfo, setShareInfo] = useState({
    token: loaderData.shareToken,
    visitCount: loaderData.visitCount,
    countCapped: loaderData.countCapped,
    countError: loaderData.countError,
  });
  const [countRefreshing, setCountRefreshing] = useState(false);
  const selectedVideo = INCIDENT_VIDEOS.find((video) => video.id === selectedVideoId) ?? INCIDENT_VIDEOS[0];
  const selectedVideoIndex = INCIDENT_VIDEOS.findIndex((video) => video.id === selectedVideo.id);
  const currentScenario = QUIZ_SCENARIOS[quizStep];
  const selectedChoice = currentScenario.choices.find((choice) => choice.id === selectedChoiceId);
  const shareUrl = shareInfo.token ? new URL(`/letter/${shareInfo.token}`, loaderData.shareOrigin).toString() : null;

  useEffect(() => {
    if (!loaderData.incomingShareToken || loaderData.shareToken === loaderData.incomingShareToken) return;

    void fetch("/api/security-campaign-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "record-visit", shareToken: loaderData.incomingShareToken }),
      keepalive: true,
    }).catch((error) => {
      console.error("Failed to record security campaign visit", error);
    });
  }, [loaderData.incomingShareToken, loaderData.shareToken]);

  const goToNextScenario = () => {
    if (!selectedChoice) return;

    const nextResults = [...quizResults, selectedChoice.correct];
    setQuizResults(nextResults);

    if (quizStep === QUIZ_SCENARIOS.length - 1) {
      setQuizComplete(true);
      return;
    }

    setQuizStep((current) => current + 1);
    setSelectedChoiceId(null);
  };

  const resetQuiz = () => {
    setQuizStep(0);
    setSelectedChoiceId(null);
    setQuizResults([]);
    setQuizComplete(false);
  };

  const requestShareSummary = async (intent: "create-share" | "refresh-count") => {
    const response = await fetch("/api/security-campaign-share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent }),
    });
    const result = (await response.json()) as SecurityCampaignActionResult;
    if (!response.ok || !result.ok) {
      throw new Error(result.ok ? "공유 정보를 불러오지 못했습니다." : result.error);
    }
    return result;
  };

  const copyPageUrl = async () => {
    if (shareStatus === "loading") return;
    setShareStatus("loading");
    try {
      let shareToken = shareInfo.token;
      if (!shareToken) {
        const result = await requestShareSummary("create-share");
        shareToken = result.shareToken;
        setShareInfo({
          token: result.shareToken,
          visitCount: result.visitCount,
          countCapped: result.countCapped,
          countError: false,
        });
      }

      const nextShareUrl = new URL(`/letter/${shareToken}`, window.location.origin);
      await copyTextToClipboard(nextShareUrl.toString());
      setShareStatus("copied");
    } catch {
      setShareStatus("error");
    }
  };

  const refreshShareCount = async () => {
    if (!shareInfo.token || countRefreshing) return;
    setCountRefreshing(true);
    try {
      const result = await requestShareSummary("refresh-count");
      setShareInfo({
        token: result.shareToken,
        visitCount: result.visitCount,
        countCapped: result.countCapped,
        countError: false,
      });
    } catch {
      setShareInfo((current) => ({ ...current, countError: true }));
    } finally {
      setCountRefreshing(false);
    }
  };

  return (
    <div data-page-max-width="wide" className="mx-auto max-w-6xl space-y-10 pb-12">
      <header className="relative overflow-hidden rounded-lg bg-card text-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
        <div className="absolute -top-24 right-16 size-72 rounded-full bg-pink-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-20 size-64 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative grid min-h-72 grid-cols-[minmax(0,1.15fr)_minmax(140px,0.85fr)] items-center sm:grid-cols-[minmax(0,1.25fr)_minmax(200px,0.75fr)] md:min-h-96 md:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.7fr)]">
          <div className="relative z-10 p-5 pr-2 sm:p-8 sm:pr-4 md:p-10 lg:p-14">
            <p className="font-mono text-sm tracking-widest text-primary">2025.08.31</p>
            <h1 className="mt-3 break-keep text-2xl leading-tight font-bold tracking-tight sm:mt-5 sm:text-3xl md:whitespace-nowrap md:text-[clamp(1.15rem,5.5vw,2.75rem)]">
              &quot;코유키의 난&quot;으로부터 1년
            </h1>
            <p className="mt-3 break-keep text-sm leading-5 font-medium text-muted-foreground sm:mt-4 sm:text-base sm:leading-6 md:mt-5">
              1년 전 오늘, 블루 아카이브에는 자그마한(?) 소동이 있었어요
            </p>
          </div>
          <div className="relative h-full self-stretch">
            <img
              src={KOYUKI_IMAGE_URL}
              alt="코유키"
              className="absolute top-4 -right-[20%] h-[130%] w-[130%] max-w-none object-contain object-top drop-shadow-2xl md:inset-auto md:right-0 md:bottom-0 md:h-full md:w-auto md:max-w-none"
              loading="eager"
            />
          </div>
        </div>
      </header>

      {loaderData.showLinkNotice ? (
        <div className="relative overflow-hidden rounded-lg bg-card px-5 py-5 shadow-lg shadow-black/5 md:px-7 md:py-6 dark:shadow-md dark:shadow-black/20">
          <div
            className="pointer-events-none absolute -top-20 right-8 size-48 rounded-full bg-pink-500/10 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative max-w-4xl">
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">방금 클릭한 링크 주소를 확인해 보셨나요?</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
              <span className="block">낯선 링크를 클릭하면 보안 문제가 생길 수 있어요.</span>
              <span className="mt-1 block">
                1년 전 블루 아카이브에서 있었던 사건을 알아보고, 간단한 보안 수칙을 살펴봐요.
              </span>
            </p>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="incident-summary-title">
        <SectionHeading
          number="01"
          title="사건 요약"
          description="당시의 현상과 대응을 시간순으로 정리했어요."
          id="incident-summary-title"
        />

        <div className="mt-5 overflow-hidden rounded-lg bg-card text-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
          <div className="grid gap-8 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:items-start">
            <ol className="relative ml-3 border-l border-primary/25">
              {INCIDENT_TIMELINE.map(({ time, title, description, Icon }, index) => (
                <li key={title} className={cn("relative pl-8", index < INCIDENT_TIMELINE.length - 1 && "pb-8")}>
                  <span className="absolute -left-4 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground ring-4 ring-card">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <p className="font-mono text-xs font-bold tabular-nums text-primary">{time}</p>
                  <h3 className="mt-1 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
                </li>
              ))}
            </ol>

            <div>
              <h3 className="mb-3 font-semibold">당시의 영상 기록</h3>
              <figure className="overflow-hidden rounded-lg bg-muted/60">
                <div className="aspect-video">
                  <iframe
                    key={selectedVideo.id}
                    className="size-full"
                    src={`https://www.youtube-nocookie.com/embed/${selectedVideo.id}?rel=0&mute=1&playsinline=1`}
                    title={`당시의 영상 기록 ${selectedVideoIndex + 1} - ${selectedVideo.channel}`}
                    allow="encrypted-media; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                <figcaption className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                  <span className="font-mono font-bold text-primary">{selectedVideoIndex + 1}</span>
                  <span>출처: {selectedVideo.channel}</span>
                </figcaption>
              </figure>

              <fieldset className="mt-3 grid grid-cols-2 gap-2">
                <legend className="sr-only">사건 기록 영상 선택</legend>
                {INCIDENT_VIDEOS.map((video, index) => {
                  const selected = video.id === selectedVideo.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedVideoId(video.id)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      <span className="block text-center font-mono text-sm font-bold">{index + 1}</span>
                    </button>
                  );
                })}
              </fieldset>
            </div>
          </div>

          <div className="flex flex-col gap-4 bg-emerald-500/10 px-5 py-4 text-emerald-700 dark:text-emerald-300 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="size-6 shrink-0" aria-hidden="true" />
              <p className="font-medium">다행히 계정·게임 데이터·결제 정보에는 영향이 없는 것으로 확인됐어요</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={OFFICIAL_NOTICE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-md bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
              >
                공식 공지
                <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
              </a>
              <a
                href={NAMU_WIKI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-md bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
              >
                나무위키
                <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="security-check-title">
        <SectionHeading
          number="02"
          title="보안 점검"
          description="보안 위협은 기업뿐 아니라 개인에게도 발생할 수 있어요. 모모톡을 읽고 각 상황에서 더 안전한 행동을 골라 보세요."
          id="security-check-title"
        />

        <div className="mt-5 overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
          {quizComplete ? (
            <QuizResult score={quizResults.filter(Boolean).length} onReset={resetQuiz} />
          ) : (
            <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="bg-primary/10 p-5 md:p-6">
                <p className="mt-2 text-4xl font-bold tabular-nums">
                  {String(quizStep + 1).padStart(2, "0")}
                  <span className="ml-1 text-base font-medium text-muted-foreground">/ 03</span>
                </p>
                <div className="mt-5 flex gap-1.5" aria-hidden="true">
                  {QUIZ_SCENARIOS.map((scenario, index) => (
                    <span
                      key={scenario.category}
                      className={cn("h-1.5 flex-1 rounded-full", index <= quizStep ? "bg-primary" : "bg-primary/15")}
                    />
                  ))}
                </div>
              </div>

              <div className="p-5 md:p-8">
                <MomoTalk
                  messages={currentScenario.messages}
                  category={currentScenario.category}
                  speaker={currentScenario.speaker}
                  avatarUrl={currentScenario.avatarUrl}
                  question={currentScenario.question}
                  choices={currentScenario.choices}
                  selectedChoiceId={selectedChoiceId}
                  onSelect={setSelectedChoiceId}
                />

                {selectedChoice ? (
                  <div
                    className={cn(
                      "mt-5 flex flex-col gap-4 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between",
                      selectedChoice.correct ? "bg-emerald-500/10" : "bg-red-500/10",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {selectedChoice.correct ? (
                        <CheckCircleIcon
                          className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-300"
                          aria-hidden="true"
                        />
                      ) : (
                        <XCircleIcon
                          className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-300"
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <p className="text-sm font-semibold">
                          {selectedChoice.correct ? "올바른 선택이에요" : "잘못된 선택이에요"}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{currentScenario.explanation}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={goToNextScenario}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      {quizStep === QUIZ_SCENARIOS.length - 1 ? "결과 보기" : "다음 문제"}
                      <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="share-section-title">
        <SectionHeading
          number="03"
          title="페이지 공유"
          description="주변에 이 페이지를 공유해 보세요."
          id="share-section-title"
        />

        <div className="mt-5 grid gap-6 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:p-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">내 링크로 들어온 방문</p>
            {shareInfo.countError ? (
              <p className="mt-2 font-medium text-red-600 dark:text-red-300">방문 수를 불러오지 못했어요.</p>
            ) : (
              <p className="mt-1 text-4xl font-bold tabular-nums">
                {shareInfo.visitCount.toLocaleString()}
                {shareInfo.countCapped ? "+" : ""}
                <span className="ml-1 text-base font-medium text-muted-foreground">회</span>
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">반영까지 시간이 걸릴 수 있어요.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {shareInfo.token ? (
              <button
                type="button"
                onClick={refreshShareCount}
                disabled={countRefreshing}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <ArrowPathIcon className={cn("size-4", countRefreshing && "animate-spin")} aria-hidden="true" />
                새로고침
              </button>
            ) : null}
            <button
              type="button"
              onClick={copyPageUrl}
              disabled={shareStatus === "loading"}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {shareStatus === "copied" ? (
                <CheckCircleIcon className="size-4" aria-hidden="true" />
              ) : (
                <ClipboardDocumentIcon className="size-4" aria-hidden="true" />
              )}
              {shareStatus === "loading" ? "링크 만드는 중" : shareStatus === "copied" ? "복사했어요" : "링크 복사"}
            </button>
            {shareStatus === "error" ? (
              <p className="w-full text-xs text-red-600 sm:text-right dark:text-red-300">
                자동 복사에 실패했어요. 아래 주소를 직접 복사해 주세요.
              </p>
            ) : null}
          </div>

          {shareUrl ? (
            <div className="sm:col-span-2">
              <label
                htmlFor="security-campaign-share-url"
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
              >
                공유 링크
              </label>
              <input
                id="security-campaign-share-url"
                type="text"
                value={shareUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MomoTalk({
  messages,
  category,
  speaker,
  avatarUrl,
  question,
  choices,
  selectedChoiceId,
  onSelect,
}: {
  messages: readonly QuizMessage[];
  category: string;
  speaker: string;
  avatarUrl: string;
  question: string;
  choices: readonly { id: string; label: string; correct: boolean }[];
  selectedChoiceId: string | null;
  onSelect: (id: string) => void;
}) {
  const secondaryContacts = MOMO_TALK_CONTACTS.filter((contact) => contact.name !== speaker).slice(0, 3);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm">
      <div className="flex h-12 items-center gap-2 bg-gradient-to-r from-pink-400 to-pink-300 px-4 text-white">
        <ChatBubbleLeftEllipsisIcon className="size-5 fill-white/30" aria-hidden="true" />
        <p className="text-lg font-black tracking-tight">MomoTalk</p>
        <span className="grid size-5 place-items-center rounded bg-white text-xs font-black text-pink-400">?</span>
        <XMarkIcon className="ml-auto size-7" aria-hidden="true" />
      </div>

      <div className="grid min-h-72 md:grid-cols-[minmax(310px,48%)_1fr]">
        <div className="hidden border-r border-slate-200 bg-slate-100 md:grid md:grid-cols-[52px_1fr]">
          <div className="bg-slate-600 text-slate-300">
            <div className="grid h-16 place-items-center border-b border-slate-500">
              <UserIcon className="size-7" aria-hidden="true" />
            </div>
            <div className="grid h-16 place-items-center bg-slate-500 text-white">
              <ChatBubbleLeftEllipsisIcon className="size-7" aria-hidden="true" />
            </div>
          </div>

          <div>
            <div className="flex h-12 items-center justify-between border-b border-slate-200 px-3">
              <span className="text-sm font-bold">안 읽은 메시지({secondaryContacts.length + 1})</span>
              <span className="rounded bg-white px-2 py-1 text-xs text-slate-500 shadow-xs">안 읽음</span>
            </div>
            <div className="flex gap-3 bg-sky-100 px-3 py-3">
              <img
                src={avatarUrl}
                alt=""
                className="aspect-square size-10 shrink-0 rounded-full bg-white object-cover"
              />
              <div className="min-w-0">
                <p className="font-bold">{speaker}</p>
                <p className="line-clamp-2 text-xs leading-4 text-slate-500">
                  {messages[0].kind === "file" ? messages[0].name : messages[0].text}
                </p>
              </div>
            </div>
            {secondaryContacts.map((contact) => (
              <div key={contact.name} className="flex gap-3 border-b border-slate-200 bg-white px-3 py-3">
                <img
                  src={contact.avatarUrl}
                  alt=""
                  className="aspect-square size-10 shrink-0 rounded-full bg-slate-100 object-cover"
                />
                <div className="min-w-0">
                  <p className="font-bold">{contact.name}</p>
                  <p className="line-clamp-2 text-xs leading-4 text-slate-500">{contact.preview}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col bg-white">
          <div className="flex h-12 items-center border-b border-slate-100 px-4">
            <span className="font-bold">{speaker}</span>
            <span className="ml-2 text-xs text-slate-400">{category}</span>
          </div>
          <div className="flex flex-1 flex-col p-4 md:p-5">
            <div className="space-y-3">
              {messages.map((message) => {
                return (
                  <div
                    key={
                      message.kind === "file" ? `${message.kind}:${message.name}` : `${message.kind}:${message.text}`
                    }
                    className="flex items-start gap-2"
                  >
                    <img
                      src={avatarUrl}
                      alt={speaker}
                      className="aspect-square size-9 shrink-0 rounded-full bg-slate-100 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-bold">{speaker}</p>
                      <div className="w-fit max-w-full rounded-lg rounded-tl-sm bg-slate-600 px-3 py-2 text-sm text-white">
                        {message.kind === "link" ? (
                          <span className="flex items-center gap-2 break-all font-medium">
                            <LinkIcon className="size-4 shrink-0" aria-hidden="true" />
                            {message.text}
                          </span>
                        ) : message.kind === "file" ? (
                          <span className="flex min-w-48 items-center gap-3 rounded bg-slate-500 px-3 py-2">
                            <PhotoIcon className="size-7 shrink-0" aria-hidden="true" />
                            <span>
                              <strong className="block text-xs">{message.name}</strong>
                              <span className="text-[11px] text-slate-200">이미지 파일</span>
                            </span>
                          </span>
                        ) : (
                          <span className="leading-6">{message.text}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <fieldset className="mt-8 rounded-tl-lg bg-sky-50 p-2 sm:ml-auto sm:w-[88%]">
              <legend className="sr-only">{question}</legend>
              <p className="border-l-2 border-sky-500 px-2 py-1 text-xs font-bold text-slate-600">{question}</p>
              <div className="mt-2 space-y-2">
                {choices.map((choice) => {
                  const selected = choice.id === selectedChoiceId;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={selectedChoiceId !== null}
                      onClick={() => onSelect(choice.id)}
                      className={cn(
                        "min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-sky-400 hover:text-sky-700 disabled:cursor-default",
                        selected && choice.correct && "border-emerald-500 bg-emerald-50 text-emerald-700",
                        selected && !choice.correct && "border-red-500 bg-red-50 text-red-700",
                        selectedChoiceId !== null && !selected && "opacity-45",
                      )}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  number,
  title,
  description,
  id,
}: {
  number: string;
  title: string;
  description: string;
  id: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="font-mono text-3xl font-bold text-primary/40">{number}</span>
      <div>
        <h2 id={id} className="text-2xl font-bold md:text-3xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function QuizResult({ score, onReset }: { score: number; onReset: () => void }) {
  const perfect = score === QUIZ_SCENARIOS.length;

  return (
    <div className="grid min-h-96 place-items-center p-6 text-center md:p-10">
      <div className="max-w-md">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheckIcon className="size-8" aria-hidden="true" />
        </span>
        <p className="mt-6 text-sm font-medium text-muted-foreground">보안 점검 결과</p>
        <p className="mt-1 text-5xl font-bold tabular-nums">
          {score}
          <span className="ml-1 text-xl font-medium text-muted-foreground">/ {QUIZ_SCENARIOS.length}</span>
        </p>
        <h3 className="mt-5 text-xl font-bold">
          {perfect ? "세 가지 상황을 모두 안전하게 판단했어요." : "정답을 다시 확인해 보세요."}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          링크와 첨부 파일은 열기 전에, 인증 정보 요청은 응답하기 전에 한 번 더 확인하세요.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 풀어보기
        </button>
      </div>
    </div>
  );
}
