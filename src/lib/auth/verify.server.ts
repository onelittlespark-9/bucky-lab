import { getRequest } from "@tanstack/react-start/server";

/** Server-side identity resolution for Bucky Lab's local/guest mode. */
export const DEV_USER_ID = "dev-user";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/** Authentication is deliberately disabled until a real production identity provider is configured. */
export const authConfigured = false;

export async function getSessionUser(_bearerToken?: string): Promise<VerifiedUser | null> {
  getRequest();
  return { id: DEV_USER_ID, email: "dev@example.com" };
}

export async function requireUserId(_bearerToken?: string): Promise<string> {
  return DEV_USER_ID;
}
