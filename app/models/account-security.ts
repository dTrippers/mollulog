import {
  type AccountSecurityRepositoryOptions,
  type AccountSessionState,
  type AccountLeaveResult,
  getAccountSessionState as getPostgresAccountSessionState,
  leaveAccount as leavePostgresAccount,
} from "~/db/postgres/account-security";

export type { AccountSecurityRepositoryOptions, AccountSessionState, AccountLeaveResult };

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
