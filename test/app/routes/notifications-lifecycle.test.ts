import { describe, expect, it, jest } from "@jest/globals";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/components/primitives", () => ({ Title: () => null }));
jest.mock("~/models/discord-notifications.server", () => ({
  DiscordNotificationValidationError: class DiscordNotificationValidationError extends Error {},
  DiscordSettingsUnavailableError: class DiscordSettingsUnavailableError extends Error {},
  getDiscordNotificationState: jest.fn(),
  parseDiscordNotificationSettingsForm: jest.fn(),
  saveDiscordNotificationSettings: jest.fn(),
}));
jest.mock("~/routes/notifications._components/NotificationChannelCard", () => () => null);
jest.mock("~/routes/notifications._components/NotificationPreferencesCard", () => () => null);

import { isNotificationSaveInFlight } from "~/routes/notifications";

describe("notification save navigation lifecycle", () => {
  it("keeps save controls busy through loading and releases them at idle", () => {
    const saveFormData = new FormData();
    saveFormData.set("intent", "save");

    expect(isNotificationSaveInFlight({ state: "submitting", formData: saveFormData })).toBe(true);
    expect(isNotificationSaveInFlight({ state: "loading", formData: saveFormData })).toBe(true);
    expect(isNotificationSaveInFlight({ state: "idle", formData: saveFormData })).toBe(false);
    expect(isNotificationSaveInFlight({ state: "loading" })).toBe(false);
  });
});
