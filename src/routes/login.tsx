import { useEffect } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SignInButtons } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  useEffect(() => { document.title = "Sign in · Bucky Lab"; }, []);
  if (!isPending && user) return <Navigate to="/" />;

  return <main className="grid min-h-dvh place-items-center bg-bg px-5 py-8">
    <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 shadow-2xl">
      <div className="mb-8"><div className="mb-5 grid size-12 place-items-center rounded-xl bg-accent text-lg font-bold text-white">BL</div><p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Diagnostic radiography simulator</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Bucky Lab</h1><p className="mt-3 text-sm leading-relaxed text-muted">Sign in to access the departmental worklists, patient simulations and positioning laboratory.</p></div>
      {isPending ? <div className="space-y-3"><div className="h-11 animate-pulse rounded-md bg-bg"/><div className="h-11 animate-pulse rounded-md bg-bg"/><p className="pt-2 text-center text-xs text-muted">Checking your session…</p></div> : <><p className="mb-3 text-sm font-medium text-fg">Sign in to continue</p><SignInButtons /></>}
      <p className="mt-7 border-t border-border pt-4 text-[11px] leading-relaxed text-muted">Training environment only. Patient cases are simulated for educational use.</p>
    </section>
  </main>;
}
