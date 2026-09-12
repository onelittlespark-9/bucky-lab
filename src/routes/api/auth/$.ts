import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

/**
 * Mount Better Auth's complete HTTP API at /api/auth/*.
 *
 * The browser auth client talks to this same-origin endpoint for sessions,
 * OAuth initiation/callbacks, and sign-out. Without this catch-all route the
 * login UI can render while every Better Auth request falls through to 404.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => auth.handler(request),
      POST: async ({ request }: { request: Request }) => auth.handler(request),
    },
  },
});
