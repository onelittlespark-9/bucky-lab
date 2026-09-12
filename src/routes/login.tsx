import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({ component: Login });

/**
 * Authentication is temporarily disabled while the production identity layer
 * is rebuilt. Keep the route as a safe compatibility redirect so old links and
 * bookmarks never land on a broken OAuth screen.
 */
function Login() {
  return <Navigate to="/" replace />;
}
