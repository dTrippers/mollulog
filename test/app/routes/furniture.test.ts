import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getLogger } from "~/lib/observability.server";
import { getFurnitureCatalogSource } from "~/models/furniture-catalog";
import { saveUserFurnitureInventory, USER_FURNITURE_INVENTORY_QUANTITY_ERROR } from "~/models/user-furniture-inventory";
import { action, shouldRevalidate } from "~/routes/furniture";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/furniture-catalog", () => ({ getFurnitureCatalogSource: jest.fn() }));
jest.mock("~/models/user-furniture-inventory", () => {
  const actual = jest.requireActual<typeof import("~/models/user-furniture-inventory")>(
    "~/models/user-furniture-inventory",
  );
  return { ...actual, saveUserFurnitureInventory: jest.fn() };
});

const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;
const mockedGetFurnitureCatalogSource = getFurnitureCatalogSource as jest.MockedFunction<
  typeof getFurnitureCatalogSource
>;
const mockedSaveUserFurnitureInventory = saveUserFurnitureInventory as jest.MockedFunction<
  typeof saveUserFurnitureInventory
>;

const env = {} as Env;
const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function createActionArgs(body: unknown) {
  return {
    context: { cloudflare: { env, ctx: undefined } },
    request: new Request("http://127.0.0.1/furniture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  } as never;
}

function createRevalidationArgs(overrides: Partial<ShouldRevalidateFunctionArgs> = {}) {
  const currentUrl = new URL("http://127.0.0.1/furniture");
  return {
    currentUrl,
    currentParams: {},
    nextUrl: new URL(currentUrl),
    nextParams: {},
    formMethod: "POST",
    formAction: "/furniture.data",
    formEncType: "application/json",
    formData: undefined,
    json: { operation: "set" },
    text: undefined,
    actionStatus: 200,
    actionResult: { ok: true, requestId: "furniture-save-1" },
    defaultShouldRevalidate: true,
    ...overrides,
  } as ShouldRevalidateFunctionArgs;
}

describe("furniture route revalidation", () => {
  it("uses the save response for its single-fetch inventory request, including failure and retry", () => {
    expect(shouldRevalidate(createRevalidationArgs())).toBe(false);
    expect(
      shouldRevalidate(
        createRevalidationArgs({
          actionStatus: 500,
          actionResult: { ok: false, requestId: "furniture-save-1", error: "retry" },
        }),
      ),
    ).toBe(false);
    expect(
      shouldRevalidate(
        createRevalidationArgs({
          actionResult: { ok: true, requestId: "furniture-save-retry" },
        }),
      ),
    ).toBe(false);
  });

  it("also recognizes the route pathname when the action does not use the single-fetch suffix", () => {
    expect(shouldRevalidate(createRevalidationArgs({ formAction: "/furniture" }))).toBe(false);
  });

  it("preserves default revalidation for manual refreshes, other actions, and navigation", () => {
    expect(
      shouldRevalidate(
        createRevalidationArgs({
          formMethod: undefined,
          formAction: undefined,
          json: undefined,
          actionStatus: undefined,
          actionResult: undefined,
        }),
      ),
    ).toBe(true);
    expect(shouldRevalidate(createRevalidationArgs({ json: { operation: "other" } }))).toBe(true);
    expect(shouldRevalidate(createRevalidationArgs({ formAction: "/utils/resources.data" }))).toBe(true);
    expect(
      shouldRevalidate(createRevalidationArgs({ nextUrl: new URL("http://127.0.0.1/furniture?search=chair") })),
    ).toBe(true);
  });
});

describe("furniture inventory action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetLogger.mockReturnValue(logger as never);
    mockedGetFurnitureCatalogSource.mockResolvedValue({ furnitures: [{ uid: "chair" }] } as never);
  });

  it("rejects values outside PostgreSQL integer range before calling the save model", async () => {
    const requestId = "furniture-quantity-limit";
    const response = await action(
      createActionArgs({
        operation: "set",
        requestId,
        furnitureUid: "chair",
        quantity: 2_147_483_648,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      requestId,
      error: USER_FURNITURE_INVENTORY_QUANTITY_ERROR,
    });
    expect(mockedSaveUserFurnitureInventory).not.toHaveBeenCalled();
  });
});
