import {
  type AccountLeaveResult,
  type AccountSecurityRepositoryOptions,
  type AccountSessionState,
  getAccountSessionState as getPostgresAccountSessionState,
  leaveAccount as leavePostgresAccount,
} from "~/db/postgres/account-security";

export type { AccountLeaveResult, AccountSecurityRepositoryOptions, AccountSessionState };

export async function getAccountSessionState(
  env: Env,
  userId: number,
  options: AccountSecurityRepositoryOptions = {},
): Promise<AccountSessionState | null> {
  return getPostgresAccountSessionState(env, userId, options);
}

export async function leaveAccount(
  env: Env,
  input: { userId: number },
  options: AccountSecurityRepositoryOptions = {},
): Promise<AccountLeaveResult> {
  return leavePostgresAccount(env, input, options);
}
