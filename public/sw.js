const INTERNAL_PATHS = ["/notifications", "/events/", "/contact/"];

function safeNotificationPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/notifications";
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.protocol !== self.location.protocol) return "/notifications";
    if (!INTERNAL_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(path))) return "/notifications";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/notifications";
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: "몰루로그 알림", body: event.data?.text() ?? "새 알림이 있어요." };
  }
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "몰루로그 알림";
  const body = typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : "새 알림이 있어요.";
  const path = safeNotificationPath(payload.path);
  const deliveryUid = typeof payload.deliveryUid === "string" ? payload.deliveryUid : null;
  event.waitUntil(self.registration.showNotification(title, { body, data: { path, deliveryUid } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safeNotificationPath(event.notification.data?.path);
  const deliveryUid = event.notification.data?.deliveryUid;
  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        const target = clients.find((client) => "focus" in client);
        if (target && "navigate" in target) return target.navigate(new URL(path, self.location.origin).toString()).then((client) => client?.focus());
        return self.clients.openWindow(new URL(path, self.location.origin).toString());
      }),
      typeof deliveryUid === "string"
        ? fetch("/api/notifications/web-push", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intent: "click", deliveryUid }),
          }).catch(() => undefined)
        : Promise.resolve(),
    ]),
  );
});
