export const ACCOUNT_LABELS = ["official"] as const;

export type AccountLabel = (typeof ACCOUNT_LABELS)[number];

export type AccountLabelPresentation = {
  label: AccountLabel;
  name: string;
  profileImageUrl: string | null;
  profileImageAlt: string | null;
};

export const ACCOUNT_LABEL_PRESENTATIONS: Record<AccountLabel, AccountLabelPresentation> = {
  official: {
    label: "official",
    name: "공식 계정",
    profileImageUrl: "/android-chrome-192x192.png",
    profileImageAlt: "몰루로그 로고",
  },
};

export function hasAccountLabel(
  labels: readonly string[] | null | undefined,
  label: AccountLabel,
): boolean {
  return labels?.includes(label) ?? false;
}

export function getPrimaryAccountLabel(labels: readonly string[] | null | undefined): AccountLabel | null {
  return ACCOUNT_LABELS.find((label) => hasAccountLabel(labels, label)) ?? null;
}
