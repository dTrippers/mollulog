import type { SessionStorage } from "react-router";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { type AuthenticateOptions, Strategy } from "remix-auth";

export interface PasskeyStrategyOptions {
  authenticationResponse: AuthenticationResponseJSON;
};

export class PasskeyStrategy<User> extends Strategy<User, PasskeyStrategyOptions> {
  name = "passkey";

  async authenticate(request: Request, sessionStorage: SessionStorage, options: AuthenticateOptions): Promise<User> {
    let user: User;
    try {
      const authenticationResponse = await request.json<AuthenticationResponseJSON>();
      user = await this.verify({ authenticationResponse });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cause = error instanceof Error ? error : undefined;
      return await this.failure(message, request, sessionStorage, options, cause as Error);
    }
    return this.success(user, request, sessionStorage, options);
  }
}
