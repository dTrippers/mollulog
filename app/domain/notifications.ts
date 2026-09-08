export type NotificationTrigger =
  | "event-start"
  | "event-end"
  | "reward-exchange-end"
  | "recruitment-start"
  | "shop-reset"
  | "feedback-reply"
  | "event-opinion-reply";

export type NotificationSettingsInput = {
  eventStartEnabled: boolean;
  eventEndEnabled: boolean;
  rewardExchangeEndEnabled: boolean;
  recruitmentStartEnabled: boolean;
  shopResetEnabled: boolean;
  feedbackReplyEnabled: boolean;
  eventOpinionReplyEnabled: boolean;
  leadHours: number;
};

export const NOTIFICATION_DEFAULTS: NotificationSettingsInput = {
  eventStartEnabled: false,
  eventEndEnabled: false,
  rewardExchangeEndEnabled: false,
  recruitmentStartEnabled: false,
  shopResetEnabled: false,
  feedbackReplyEnabled: false,
  eventOpinionReplyEnabled: false,
  leadHours: 24,
};

export class NotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationValidationError";
  }
}

export function validateNotificationSettings(input: NotificationSettingsInput): NotificationSettingsInput {
  if (!Number.isInteger(input.leadHours) || input.leadHours < 1 || input.leadHours > 24) {
    throw new NotificationValidationError("알림 시점은 1시간 전부터 24시간 전까지 선택할 수 있어요.");
  }
  return { ...input, leadHours: input.leadHours };
}

export function getEnabledNotificationTriggers(settings: NotificationSettingsInput): NotificationTrigger[] {
  return [
    settings.eventStartEnabled ? "event-start" : null,
    settings.eventEndEnabled ? "event-end" : null,
    settings.rewardExchangeEndEnabled ? "reward-exchange-end" : null,
    settings.recruitmentStartEnabled ? "recruitment-start" : null,
    settings.shopResetEnabled ? "shop-reset" : null,
    settings.feedbackReplyEnabled ? "feedback-reply" : null,
    settings.eventOpinionReplyEnabled ? "event-opinion-reply" : null,
  ].filter((trigger): trigger is NotificationTrigger => trigger !== null);
}
