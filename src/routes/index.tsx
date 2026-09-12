import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Lab } from "@/components/app/Lab";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;
  return <Lab />;
}

function LoadingScreen() {
  return <main className="grid min-h-dvh place-items-center bg-bg px-5"><div className="w-full max-w-sm text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-accent text-lg font-bold text-white shadow-lg">BL</div><h1 className="text-xl font-semibold text-fg">Loading Bucky Lab</h1><p className="mt-2 text-sm text-muted">Checking your session and preparing the radiography laboratory…</p><div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-bg"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div></div></main>;
}
