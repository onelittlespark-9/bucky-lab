import { createAuthClient } from "better-auth/react";

/**
 * Authentication is intentionally disabled in the stable simulator build.
 *
 * The previous Grok OAuth integration depended on credentials that are not
 * available to this deployment. Keeping a half-configured OAuth client made
 * sign-in failures surface as opaque 500 errors and added an unnecessary
 * dependency to the simulator startup path.
 *
 * Authentication can be reintroduced later behind an explicit provider and
 * production configuration without coupling the core simulator to it.
 */
export const authEnabled = false;

/** Kept as a small local client boundary so future auth can be added without
 * changing the rest of the application. It is never queried while auth is off.
 */
export const authClient = createAuthClient();

export const GROK_PROVIDERS: readonly [] = [];

export function getBearerToken(): string | null {
  return null;
}

export async function signIn(): Promise<void> {
  throw new Error("Sign-in is temporarily disabled while authentication is being rebuilt.");
}

export async function signOut(): Promise<void> {
  // No remote authentication exists in stable guest mode.
}
