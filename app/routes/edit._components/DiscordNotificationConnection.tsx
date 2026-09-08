import { ArrowPathIcon, BellAlertIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaDiscord } from "react-icons/fa6";
import { Form } from "react-router";
import type { DiscordProfileFeedback } from "~/components/features/auth/discord-profile-feedback";
import { Button, SectionCard } from "~/components/primitives";
import { cn } from "~/lib/utils";
import type { DiscordConnection } from "~/models/discord-notifications.server";
import type { WebPushNotificationSummary } from "~/models/web-push-notifications.server";

type DiscordNotificationConnectionProps = {
  connection: DiscordConnection | null;
  webPush: WebPushNotificationSummary;
  notice?: DiscordProfileFeedback | null;
  error?: string;
  isSubmitting: boolean;
};

function ConnectionStatus({ connection }: { connection: DiscordConnection | null }) {
  const status = connection?.status ?? "none";
  const label =
    status === "pending"
      ? "연결 확인 중"
      : status === "active"
        ? "연결됨"
        : status === "failed"
          ? "연결 실패"
          : "연결되지 않음";

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm",
        status === "active" ? "text-emerald-700 dark:text-emerald-300" : null,
        status === "failed" ? "text-destructive" : null,
        status !== "active" && status !== "failed" ? "text-muted-foreground" : null,
      )}
    >
      {status === "pending" ? <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {status === "active" ? <CheckCircleIcon className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </p>
  );
}

function ConnectionAction({
  connection,
  isSubmitting,
}: Pick<DiscordNotificationConnectionProps, "connection" | "isSubmitting">) {
  if (connection?.status === "pending" || connection?.status === "active") {
    return (
      <Form
        method="post"
        onSubmit={(event) => {
          if (
            connection.status === "active" &&
            !window.confirm("연결을 끊으면 모든 알림을 받을 수 없어요. 정말 연결을 끊을까요?")
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="discord-unlink" />
        <Button
          type="submit"
          size="sm"
          variant={connection.status === "active" ? "danger-subtle" : "secondary"}
          disabled={isSubmitting}
        >
          {connection.status === "pending" ? "연결 취소" : "연결 해제"}
        </Button>
      </Form>
    );
  }

  return (
    <Form method="post" action="/auth/discord/notifications/connect">
      <input type="hidden" name="intent" value="notification-connect" />
      <Button type="submit" size="sm" variant="primary" disabled={isSubmitting}>
        {connection?.status === "failed" ? "다시 시도" : "연결"}
      </Button>
    </Form>
  );
}

type BrowserPushStatus =
  | "checking"
  | "permission-default"
  | "requesting"
  | "unsubscribing"
  | "active"
  | "inactive"
  | "denied"
  | "unsupported"
  | "ios-home-screen"
  | "expired"
  | "error";

type SerializedSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const value = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function serializeSubscription(subscription: PushSubscription): SerializedSubscription | null {
  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!p256dh || !auth) return null;
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: { p256dh: bytesToBase64Url(p256dh), auth: bytesToBase64Url(auth) },
  };
}

function isIosBrowserWithoutHomeScreen(): boolean {
  const userAgent = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIos && !window.matchMedia("(display-mode: standalone)").matches;
}

function statusCopy(status: BrowserPushStatus): string {
  switch (status) {
    case "checking":
      return "지원 여부 확인 중";
    case "permission-default":
      return "알림 권한이 필요해요";
    case "requesting":
      return "등록 중";
    case "unsubscribing":
      return "해제 중";
    case "active":
      return "이 브라우저에서 사용 중";
    case "inactive":
      return "이 브라우저에서 꺼짐";
    case "denied":
      return "알림 권한이 거부됨";
    case "unsupported":
      return "이 브라우저에서는 지원하지 않음";
    case "ios-home-screen":
      return "홈 화면에 추가해야 사용 가능";
    case "expired":
      return "구독이 만료되어 다시 등록해야 함";
    case "error":
      return "등록 상태를 확인하지 못했어요";
  }
}

function statusClass(status: BrowserPushStatus): string {
  if (status === "active") return "text-emerald-700 dark:text-emerald-300";
  if (["denied", "error", "expired"].includes(status)) return "text-destructive";
  return "text-muted-foreground";
}

function BrowserPushNotificationSettings({ config }: { config: WebPushNotificationSummary }) {
  const [status, setStatus] = useState<BrowserPushStatus>("checking");
  const [isBusy, setIsBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const statusRef = useRef<HTMLParagraphElement>(null);
  const previousStatusRef = useRef<BrowserPushStatus>("checking");
  const isConfigured = config.configured && Boolean(config.vapidPublicKey);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (
      ["requesting", "unsubscribing"].includes(previousStatus) &&
      ["active", "inactive", "denied", "error", "permission-default"].includes(status)
    ) {
      statusRef.current?.focus();
    }
    previousStatusRef.current = status;
  }, [status]);

  const recordEvent = useCallback((event: string) => {
    void fetch("/api/notifications/web-push", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "event", event }),
    }).catch(() => undefined);
  }, []);

  const inspect = useCallback(async () => {
    if (!config.configured || !config.vapidPublicKey) {
      setStatus("error");
      recordEvent("error");
      return;
    }
    if (isIosBrowserWithoutHomeScreen()) {
      setStatus("ios-home-screen");
      recordEvent("unsupported");
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      !window.isSecureContext
    ) {
      setStatus("unsupported");
      recordEvent("unsupported");
      return;
    }
    try {
      const permission = Notification.permission;
      if (permission === "denied") {
        setStatus("denied");
        recordEvent("permission-denied");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setStatus(permission === "default" ? "permission-default" : "inactive");
        return;
      }
      const serialized = serializeSubscription(subscription);
      if (!serialized) {
        setStatus("error");
        return;
      }
      const response = await fetch("/api/notifications/web-push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "status", subscription: serialized }),
      });
      if (!response.ok) throw new Error("status request failed");
      const body = (await response.json()) as { state?: { currentSubscriptionStatus?: string | null } };
      const isActive = body.state?.currentSubscriptionStatus === "active";
      setStatus(isActive ? "active" : "expired");
      if (!isActive) recordEvent("expired");
    } catch {
      setStatus("error");
    }
  }, [config.configured, config.vapidPublicKey, recordEvent]);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  const subscribe = async () => {
    if (!config.vapidPublicKey || isBusy) return;
    setIsBusy(true);
    setStatus("requesting");
    recordEvent("attempt");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "permission-default");
        if (permission === "denied") recordEvent("permission-denied");
        setAnnouncement(
          permission === "denied"
            ? "브라우저 설정에서 알림 권한을 허용해주세요."
            : "알림 권한을 허용하면 이 브라우저를 등록할 수 있어요.",
        );
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const paddedKey =
        config.vapidPublicKey.replaceAll("-", "+").replaceAll("_", "/") +
        "===".slice((config.vapidPublicKey.length + 3) % 4);
      const applicationServerKey = Uint8Array.from(atob(paddedKey), (character) => character.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const serialized = serializeSubscription(subscription);
      if (!serialized) throw new Error("subscription keys unavailable");
      const response = await fetch("/api/notifications/web-push", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "subscribe", subscription: serialized }),
      });
      if (!response.ok) throw new Error("subscription request failed");
      setStatus("active");
      recordEvent("success");
      setAnnouncement("브라우저 알림을 켰어요.");
    } catch {
      setStatus("error");
      recordEvent("error");
      setAnnouncement("브라우저 알림을 등록하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsBusy(false);
    }
  };

  const unsubscribe = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setStatus("unsubscribing");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription();
      const serialized = subscription ? serializeSubscription(subscription) : null;
      if (serialized) {
        const response = await fetch("/api/notifications/web-push", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "unsubscribe", subscription: serialized }),
        });
        if (!response.ok) throw new Error("unsubscription request failed");
        await subscription?.unsubscribe();
      }
      setStatus("inactive");
      recordEvent("unsubscribe");
      setAnnouncement("브라우저 알림을 껐어요.");
    } catch {
      setStatus("error");
      recordEvent("error");
      setAnnouncement("브라우저 알림을 해제하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsBusy(false);
    }
  };

  const canSubscribe = ["permission-default", "inactive", "expired"].includes(status);
  const canUnsubscribe = status === "active" || status === "unsubscribing";

  return (
    <div className="flex items-center gap-3 rounded-md bg-background px-4 py-3">
      <BellAlertIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">브라우저 알림</p>
        <p
          ref={statusRef}
          className={`flex items-center gap-1.5 text-sm outline-none ${statusClass(status)}`}
          role="status"
          tabIndex={-1}
        >
          {status === "checking" || status === "requesting" || status === "unsubscribing" ? (
            <ArrowPathIcon className="size-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {["denied", "error", "expired"].includes(status) ? (
            <ExclamationTriangleIcon className="size-3.5" aria-hidden="true" />
          ) : null}
          {status === "active" ? <CheckCircleIcon className="size-3.5" aria-hidden="true" /> : null}
          {statusCopy(status)}
        </p>
        {status === "denied" ? (
          <p className="mt-1 text-xs text-muted-foreground">브라우저 설정에서 알림 권한을 허용해주세요.</p>
        ) : null}
        {status === "ios-home-screen" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Safari에서 공유 버튼을 누르고 ‘홈 화면에 추가’를 선택한 뒤, 홈 화면에서 Web App을 다시 열어주세요.
          </p>
        ) : null}
        {status === "error" ? (
          isConfigured ? (
            <p className="mt-1 text-xs text-destructive" role="alert">
              브라우저 알림 상태를 확인하지 못했어요. 잠시 후 다시 확인해주세요.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">현재 브라우저 알림 설정을 사용할 수 없어요.</p>
          )
        ) : null}
      </div>
      <div className="flex shrink-0 sm:justify-end">
        {canSubscribe ? (
          <Button type="button" size="sm" variant="primary" disabled={isBusy} onClick={() => void subscribe()}>
            이 브라우저에서 켜기
          </Button>
        ) : null}
        {canUnsubscribe ? (
          <Button type="button" size="sm" variant="danger-subtle" disabled={isBusy} onClick={() => void unsubscribe()}>
            {status === "unsubscribing" ? "끄는 중..." : "이 브라우저에서 끄기"}
          </Button>
        ) : null}
        {status === "error" && isConfigured ? (
          <Button type="button" size="sm" variant="secondary" disabled={isBusy} onClick={() => void inspect()}>
            상태 다시 확인
          </Button>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

export default function DiscordNotificationConnection({
  connection,
  webPush,
  notice,
  error,
  isSubmitting,
}: DiscordNotificationConnectionProps) {
  return (
    <section
      id="notification-channels"
      className="scroll-mt-[var(--mobile-header-height)] lg:scroll-mt-4"
      aria-label="알림 수단"
      tabIndex={-1}
    >
      <SectionCard title="알림 수단">
        <div className="space-y-5">
          {notice?.area === "notification" ? (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-sm",
                notice.tone === "success"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "bg-red-500/10 text-red-700 dark:text-red-300",
              )}
            >
              {notice.text}
            </p>
          ) : null}
          {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <section
            id="discord-notifications"
            className="scroll-mt-[var(--mobile-header-height)] lg:scroll-mt-4"
            aria-label="Discord 알림 설정"
            tabIndex={-1}
          >
            <div className="flex items-center gap-3 rounded-md bg-background px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FaDiscord className="size-5" color="#5865F2" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">Discord</p>
                  <ConnectionStatus connection={connection} />
                </div>
              </div>
              <div className="flex shrink-0 sm:justify-end">
                <ConnectionAction connection={connection} isSubmitting={isSubmitting} />
              </div>
            </div>
          </section>
          <BrowserPushNotificationSettings config={webPush} />
        </div>
      </SectionCard>
    </section>
  );
}
