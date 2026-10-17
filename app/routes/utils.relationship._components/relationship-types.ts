import type { AllStudentsFavoriteItems } from "~/models/resource";

export type AllFavoriteItemsLoad = { status: "ready"; items: AllStudentsFavoriteItems[] } | { status: "error" };

export type RelationshipGiftCalculationMode = "manual" | "owned";
